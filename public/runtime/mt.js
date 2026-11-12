// Free translation in the browser: Chrome's Translator API, else the bundled opus-mt model.
import './ai-account-ui.js';
import { RUNTIME_BASE, lsGet, lsSet } from './util.js';

var MT_LOCAL_MB=113, MT_LOCAL_KEY='ptl-mt-local';
var mt={engine:null,tr:null,worker:null,prep:null,seq:0,wait:{}};
function browserMT(){ return typeof self.Translator!=='undefined'&&typeof self.Translator.availability==='function'; }
function localInfo(){
  var cached=lsGet(MT_LOCAL_KEY)==='1';
  return {engine:'local',label:'开源翻译模型（在本机运行）',ready:!!(mt.engine==='local'&&mt.worker)||cached,download:!cached,sizeMB:MT_LOCAL_MB};
}
export function mtStatus(){
  if(mt.engine==='browser'&&mt.tr) return Promise.resolve({engine:'browser',label:'浏览器内置翻译',ready:true,download:false});
  if(!browserMT()) return Promise.resolve(localInfo());
  if(mt.noBrowser) return Promise.resolve(localInfo());
  // some browsers expose the API but never answer (no on-device model service): give up after 3 s
  var timeout=new Promise(function(res){ setTimeout(function(){ res('timeout'); },3000); });
  return Promise.race([self.Translator.availability({sourceLanguage:'en',targetLanguage:'zh'}),timeout]).then(function(a){
    if(a==='timeout') mt.noBrowser=true;
    if(a==='unavailable'||a==='timeout') return localInfo();
    return {engine:'browser',label:'浏览器内置翻译',ready:a==='available',download:a!=='available'};
  },localInfo);
}
// onProgress(fraction 0–1) while models download; call from a click when a download is due
export function mtPrepare(onProgress){
  if(mt.prep) return mt.prep;
  mt.prep=mtStatus().then(function(st){
    if(st.engine==='browser'){
      return self.Translator.create({sourceLanguage:'en',targetLanguage:'zh',monitor:function(m){
        m.addEventListener('downloadprogress',function(e){ if(onProgress) onProgress(e.loaded); });
      }}).then(function(t){ mt.tr=t; mt.engine='browser'; },function(e){
        // the language pack can only start downloading from a click
        if(e&&e.name==='NotAllowedError') throw {code:'mt_activation',message:'点一下「开始翻译」来下载浏览器的翻译语言包。'};
        console.warn('Translator API:',e); return startLocal(onProgress);
      });
    }
    return startLocal(onProgress);
  }).catch(function(e){ mt.prep=null; throw e; });
  return mt.prep;
}
function startLocal(onProgress){
  return new Promise(function(res,rej){
    var w=new Worker(new URL('mt-worker.js',RUNTIME_BASE),{type:'module'});
    w.onmessage=function(e){
      var m=e.data;
      if(m.type==='progress'){ if(onProgress&&m.total) onProgress(m.loaded/m.total); }
      else if(m.type==='ready'){ mt.worker=w; mt.engine='local'; lsSet(MT_LOCAL_KEY,'1'); res(); }
      else if(m.type==='out'||m.type==='error'){
        var cb=mt.wait[m.id]; if(!cb) { if(m.type==='error'&&!mt.worker) rej({code:'mt_failed',message:m.message}); return; }
        delete mt.wait[m.id]; if(m.type==='out') cb.res(m.texts); else cb.rej({code:'mt_failed',message:m.message});
      }
    };
    w.onerror=function(e){ rej({code:'mt_failed',message:(e&&e.message)||'翻译模型加载失败'}); };
    w.postMessage({type:'load'});
  });
}
// split long text at sentence ends so each piece fits the model
function pieces(text,max){
  var s=text.match(/[^.!?;:]+(?:[.!?;:]+["'’”)\]]*\s*|$)/g)||[text], out=[], cur='';
  s.forEach(function(x){
    if(cur&&cur.length+x.length>max){ out.push(cur); cur=''; }
    while(x.length>max){ var cut=x.lastIndexOf(' ',max); if(cut<max/2) cut=max; out.push(x.slice(0,cut)); x=x.slice(cut); }
    cur+=x;
  });
  if(cur.trim()) out.push(cur);
  return out.map(function(p){ return p.trim(); }).filter(Boolean);
}
// half-width punctuation between Chinese characters → full-width
function zhPunct(t){
  var map={',':'，',';':'；',':':'：','?':'？','!':'！','(':'（',')':'）'};
  return String(t).replace(/([㐀-鿿＀-￯])\s*([,;:?!])\s*/g,function(_,a,b){ return a+map[b]; })
    .replace(/([㐀-鿿])\s*\(([^()]*)\)/g,'$1（$2）').replace(/\s+([㐀-鿿])/g,'$1').trim();
}
export function mtTranslate(text,opts){
  opts=opts||{};
  if(opts.signal&&opts.signal.aborted) return Promise.reject({code:'cancelled'});
  return mtPrepare(opts.onProgress).then(function(){
    if(mt.engine==='browser'){
      var parts=pieces(text,1800), out=[];
      return parts.reduce(function(p,x){
        return p.then(function(){
          if(opts.signal&&opts.signal.aborted) throw {code:'cancelled'};
          return mt.tr.translate(x).then(function(r){ out.push(r); });
        });
      },Promise.resolve()).then(function(){ return zhPunct(out.join('')); });
    }
    return new Promise(function(res,rej){
      var id=++mt.seq; mt.wait[id]={res:res,rej:rej};
      mt.worker.postMessage({type:'tr',id:id,texts:pieces(text,380)});
    }).then(function(t){
      if(opts.signal&&opts.signal.aborted) throw {code:'cancelled'};
      return zhPunct(t.join(''));
    });
  });
}
