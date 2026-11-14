// Voice settings panel: download, choose and remove voice packs.
import './downloads.js';
import { el, esc, lsGet, lsSet, noop } from './util.js';
import { closeModal, mroot } from './modal.js';
import { fillVoices, status, tts } from './tts.js';
import { KK, kkFetch, kkUrl, setZHLEX, setZHMAXW, setZhDataP, zhDataP } from './kokoro.js';
import {
  DM, MB, dmCancel, dmDelete, dmDownload, dmHave, dmPct, dmScan, kkPreview, kkStopPreview,
} from './downloads.js';
import { speakAt, ttsHalt } from './player.js';

function fmtMB(b){ return (b/MB).toFixed(b<10*MB?1:0)+' MB'; }
function fmtLeft(s){ if(!isFinite(s)||s<=0) return ''; if(s<60) return '剩余约 '+Math.ceil(s)+' 秒'; return '剩余约 '+Math.ceil(s/60)+' 分钟'; }
var ICON=function(n){ return '<svg class="ic" aria-hidden="true"><use href="#i-'+n+'"></use></svg>'; };
function vpRow(it){
  var chip={done:'<span class="vp-chip ok">已下载</span>',downloading:'<span class="vp-chip run">下载中 '+Math.floor(dmPct(it)*100)+'%</span>',
    partial:'<span class="vp-chip">未完成</span>',none:'<span class="vp-chip">未下载</span>',error:'<span class="vp-chip err">下载失败</span>',unknown:'<span class="vp-chip">检查中…</span>'}[it.state]||'';
  var cur='';
  if(it.voice){ var sel=lsGet('ttsVoice:'+it.lang,''); var def=it.lang==='zh'?'kokoro:zf_051':'kokoro:af_maple'; if((sel||def)==='kokoro:'+it.voice) cur='<span class="vp-chip cur">当前旁白</span>'; }
  var prog='';
  if(it.state==='downloading'||it.state==='partial'||it.state==='error'){
    var have=dmHave(it), meta=fmtMB(have)+' / '+fmtMB(it.total);
    if(it.state==='downloading'&&it.rate>0) meta+=' · '+(it.rate/MB).toFixed(1)+' MB/s · '+fmtLeft((it.total-have)/it.rate);
    if(it.state==='error') meta+=' · '+esc(it.err||'');
    prog='<div class="vp-prog"><div class="vp-bar"><span style="width:'+(dmPct(it)*100).toFixed(1)+'%"></span></div><div class="vp-meta">'+meta+'</div></div>';
  }
  var act='';
  if(it.voice){
    var playing=KK.pvVoice===it.voice;
    act+='<button class="vp-btn" type="button" data-act="preview" data-id="'+it.id+'">'+ICON(playing?'pause':'speak')+(playing?(KK.pvBusy?'生成中…':'停止'):'试听')+'</button>';
    if(!cur) act+='<button class="vp-btn" type="button" data-act="use" data-id="'+it.id+'">设为旁白</button>';
  }
  if(it.state==='downloading') act+='<button class="vp-btn" type="button" data-act="cancel" data-id="'+it.id+'">取消</button>';
  else if(it.state!=='done') act+='<button class="vp-btn'+(it.voice?'':' primary')+'" type="button" data-act="download" data-id="'+it.id+'">'+ICON('download')+(it.state==='partial'||it.state==='error'?'继续':'下载')+'</button>';
  if(it.state==='done'||it.state==='partial') act+='<button class="vp-btn icon" type="button" data-act="delete" data-id="'+it.id+'" title="删除" aria-label="删除 '+esc(it.name)+'">'+ICON('trash')+'</button>';
  return '<div class="vp-row"><div class="vp-main"><div class="vp-name">'+esc(it.name)+chip+cur+'</div><div class="vp-desc">'+esc(it.desc)+' · '+fmtMB(it.total)+'</div>'+prog+'</div><div class="vp-act">'+act+'</div></div>';
}
function vpRender(){
  var body=document.getElementById('vpbody'); if(!body) return;
  var g=function(k){ return DM.items.filter(function(it){ return it.group===k; }).map(vpRow).join(''); };
  var total=DM.items.reduce(function(a,it){ return a+it.total; },0), have=DM.items.reduce(function(a,it){ return a+(it.state==='done'?it.total:0); },0);
  var est=DM.est, store='';
  if(est&&est.quota) store='<div class="vp-store"><span>浏览器存储：已用 '+fmtMB(est.usage||0)+'，可用约 '+(est.quota/1073741824).toFixed(1)+' GB</span><div class="vp-bar"><span style="width:'+Math.min(100,(est.usage||0)/est.quota*100).toFixed(1)+'%"></span></div></div>';
  var busy=DM.items.some(function(it){ return it.state==='downloading'; });
  body.innerHTML=
    '<section class="vp-sec"><div class="vp-h">核心组件</div>'+g('core')+'</section>'+
    '<section class="vp-sec"><div class="vp-h">中文旁白</div>'+g('zh')+'</section>'+
    '<section class="vp-sec"><div class="vp-h">英文旁白</div>'+g('en')+'</section>'+
    '<div class="vp-foot">'+store+
      '<div class="vp-line">'+
        (navigator.storage&&navigator.storage.persist?'<label class="vp-check"><input type="checkbox" data-act="persist"'+(DM.persisted?' checked disabled':'')+'> '+(DM.persisted?'已设为保留，浏览器不会自动清理':'请求浏览器长期保留这些文件')+'</label>':'<span></span>')+
        '<div class="vp-act">'+
          (busy?'<button class="vp-btn" type="button" data-act="cancelall">全部取消</button>':'<button class="vp-btn primary" type="button" data-act="all"'+(have>=total?' disabled':'')+'>'+ICON('download')+'全部下载</button>')+
          '<button class="vp-btn" type="button" data-act="clear">'+ICON('trash')+'全部删除</button>'+
        '</div>'+
      '</div>'+
    '</div>';
}
function openVoicePanel(){
  mroot._tok=(mroot._tok||0)+1; mroot.classList.remove('closing');
  mroot.innerHTML='';
  var box=el('div','mbox vp-box');
  box.innerHTML='<div class="vp"><div class="vp-head"><div><h3 class="mtitle">语音包管理</h3><p class="vp-sub">朗读用的语音都在你的浏览器里本地生成。文件下载一次后保存在浏览器中，之后可离线使用；不用的可以随时删除以释放空间。</p></div>'+
    '<button class="icon-btn" type="button" data-act="close" title="关闭" aria-label="关闭">'+ICON('close')+'</button></div><div id="vpbody"></div></div>';
  mroot.appendChild(box); mroot.hidden=false;
  vpRender(); dmScan();
  box.addEventListener('click',function(e){
    var b=e.target.closest('[data-act]'); if(!b||b.tagName==='INPUT') return;
    var act=b.dataset.act, it=DM.byId[b.dataset.id];
    if(act==='close'){ closeModal(); return; }
    if(act==='download') dmDownload(it.id).catch(noop);
    else if(act==='cancel') dmCancel(it.id);
    else if(act==='delete') dmDelete(it.id);
    else if(act==='preview'){ if(KK.pvVoice===it.voice) kkStopPreview(); else kkPreview(it.voice,it.lang); }
    else if(act==='use'){ var was=tts.playing&&tts.lang===it.lang; ttsHalt(); lsSet('ttsVoice:'+it.lang,'kokoro:'+it.voice); if(tts.lang===it.lang){ fillVoices(); if(was) speakAt(tts.idx,tts.char); else status(); } vpRender(); }
    else if(act==='all') DM.items.forEach(function(x){ if(x.state!=='done') dmDownload(x.id).catch(noop); });
    else if(act==='cancelall') DM.items.forEach(function(x){ dmCancel(x.id); });
    else if(act==='clear'){ if(confirmClear(b)) DM.items.forEach(function(x){ dmDelete(x.id); }); }
  });
  box.addEventListener('change',function(e){
    if(e.target.dataset.act==='persist'&&e.target.checked){ navigator.storage.persist().then(function(ok){ DM.persisted=ok; if(!ok) e.target.checked=false; vpRender(); },function(){ e.target.checked=false; }); }
  });
}
// two-step confirmation without a browser dialog
function confirmClear(b){
  if(b.dataset.armed==='1') return true;
  b.dataset.armed='1'; b.innerHTML=ICON('trash')+'再点一次确认删除';
  setTimeout(function(){ if(b.isConnected){ b.dataset.armed=''; b.innerHTML=ICON('trash')+'全部删除'; } },3000);
  return false;
}
DM.listeners.push(function(){ if(document.getElementById('vpbody')&&!document.querySelector('#vpbody [data-armed="1"]')) vpRender(); });
document.getElementById('vpopen').addEventListener('click',openVoicePanel);
document.getElementById('plsettings').addEventListener('click',openVoicePanel);

export function kkZhData(){
  if(zhDataP) return zhDataP;
  var dec=function(b){ return new TextDecoder().decode(b); };
  setZhDataP(dmDownload('zh').then(function(){
    return kkFetch(kkUrl('kokoro/lexicon-zh.txt'),noop,{raw:true}).then(dec).then(function(t){
      var lex=Object.create(null), max=1;
      t.split('\n').forEach(function(line){ var sp=line.indexOf(' '); if(sp<1) return; var w=line.slice(0,sp); lex[w]=line.slice(sp+1).replace(/\s+/g,''); if(w.length>max) max=w.length; });
      setZHLEX(lex); setZHMAXW(Math.min(max,8));
    });
  }).catch(function(e){ setZhDataP(null); throw e; }));
  return zhDataP;
}
