// Listening: sentence queue, timing estimate and the system speech voices.
import './annotations.js';
import { el, lsGet, lsSet } from './util.js';
import { curPane, getBlocks, posToDom } from './annotations.js';
import { KK, KVOICES, kkAvailable, useKokoro, voiceSel } from './kokoro.js';
import { kkReset, kkStop } from './kokoro-engine.js';

export var synth=window.speechSynthesis||null;
export var player=document.getElementById('player'), plPlay=document.getElementById('plplay'), plStatus=document.getElementById('plstatus'),
    plProg=document.getElementById('plprog'), plVoice=document.getElementById('plvoice'), plRate=document.getElementById('plrate'),
    plNote=document.getElementById('plnote'), plLangBtns=[].slice.call(document.querySelectorAll('#pllang button'));
export var tts={open:false,playing:false,lang:lsGet('ttsLang','en')==='zh'?'zh':'en',rate:parseFloat(lsGet('ttsRate','1'))||1,
         queue:null,idx:-1,char:0,bchar:0,token:0,errs:0,voices:[]};
function langOfText(t){
  var cj=(t.match(/[㐀-鿿豈-﫿]/g)||[]).length, la=(t.match(/[A-Za-z]/g)||[]).length;
  if(!cj&&!la) return null;
  return cj*3>=la?'zh':'en';
}
export function runsOf(block){
  var w=document.createTreeWalker(block,NodeFilter.SHOW_TEXT,null),n,pos=0,runs=[],cur=null,chars=[];
  while((n=w.nextNode())){
    var t=n.data, L=t.length, pe=n.parentElement, skip=!!pe.closest('sup'), lg=null;
    if(!skip){
      var c=pe.closest('.zh,.en,.nb,.ph');
      if(c&&(c===block||block.contains(c))) lg=(c.classList.contains('zh')||c.classList.contains('nb'))?'zh':'en';
      else lg=langOfText(t);
    }
    chars.push(skip?t.replace(/[\s\S]/g,' '):t);
    if(lg&&(!cur||cur.lang!==lg)){ cur={lang:lg,s:pos,e:pos+L}; runs.push(cur); }
    else if(cur) cur.e=pos+L;
    pos+=L;
  }
  return {runs:runs,text:chars.join('')};
}
var SENT={en:/[^.!?…;]+(?:[.!?…;]+["'”’)\]]*|$)\s*/g, zh:/[^。！？；…]+(?:[。！？；…]+[”’」』）)]*|$)/g};
function chunksOf(block,out,want){
  var ro=runsOf(block);
  ro.runs.forEach(function(run){
    if(run.lang!==want) return;
    var text=ro.text.slice(run.s,run.e), re=SENT[want], m, parts=[];
    re.lastIndex=0;
    while((m=re.exec(text))&&m[0].length){ parts.push([run.s+m.index,run.s+m.index+m[0].length]); }
    // merge fragments that are too short, split ones that are too long
    var merged=[];
    parts.forEach(function(p){
      var prev=merged[merged.length-1];
      if(prev&&(prev[1]-prev[0]<(want==='zh'?8:28))&&(p[1]-prev[0]<220)) prev[1]=p[1]; else merged.push(p.slice());
    });
    merged.forEach(function(p){
      var s=p[0],e=p[1],max=want==='zh'?110:230;
      while(e-s>max){
        var seg=ro.text.slice(s,s+max), cut=Math.max(seg.lastIndexOf(want==='zh'?'，':', '),seg.lastIndexOf(want==='zh'?'、':' — '),seg.lastIndexOf(': '));
        if(cut<max*0.4) cut=want==='zh'?max:Math.max(seg.lastIndexOf(' '),max*0.5);
        cut=Math.floor(cut)+1; push(s,s+cut); s+=cut;
      }
      push(s,e);
    });
    function push(s,e){ var t=ro.text.slice(s,e); if(t.trim()) out.push({block:block,s:s,e:e,text:t.replace(/\s+/g,' ')}); }
  });
}
export function buildQueue(){
  var pane=curPane(), q=[];
  if(pane){
    var head=[].slice.call(pane.querySelectorAll('.dochead .dt,.dochead .dz,.dochead .dauth'));
    head.concat(getBlocks(pane)).forEach(function(b){ chunksOf(b,q,tts.lang); });
  }
  tts.queue=q; kkReset();
  return q;
}
export function ensureQueue(){ if(!tts.queue) buildQueue(); return tts.queue; }
/* ---- duration estimate (Web Speech gives no length, so estimate and self-calibrate) ---- */
var BASE_CPS={en:14.5,zh:4.4}, cal={};
try{ cal=JSON.parse(lsGet('ttsCal','{}'))||{}; }catch(e){ cal={}; }
export var plTime=document.getElementById('pltime'), cumKey='', cum=[0], t0=0, t0char=0, tick=0;
export function setT0(v){ return t0=v; }
export function setT0char(v){ return t0char=v; }
function calKey(){ if(useKokoro()) return 'en|'+voiceSel(); var v=pickVoice(); return tts.lang+'|'+(v?v.name:'default'); }
function cps(){ return cal[calKey()]||BASE_CPS[tts.lang]; }
function durOf(len){ return len/cps()/tts.rate; }
export function cumTimes(){
  var q=tts.queue||[], key=q.length+'|'+calKey()+'|'+tts.rate+'|'+cps().toFixed(3);
  if(key!==cumKey||cum.length!==q.length+1){
    cum=[0]; for(var i=0;i<q.length;i++) cum.push(cum[i]+durOf(q[i].text.length));
    cumKey=key;
  }
  return cum;
}
function curTime(){
  var q=tts.queue||[], c=cumTimes(); if(tts.idx<0||!q[tts.idx]) return 0;
  var item=q[tts.idx], d=c[tts.idx+1]-c[tts.idx], L=item.text.length||1;
  var t=c[tts.idx]+d*(tts.char/L);
  if(tts.playing&&t0) t+=Math.min((performance.now()-t0)/1000,d*(1-tts.char/L));
  return t;
}
function fmt(sec){
  sec=Math.max(0,Math.round(sec)); var h=Math.floor(sec/3600), m=Math.floor(sec%3600/60), s2=sec%60;
  return (h?h+':'+String(m).padStart(2,'0'):String(m).padStart(2,'0'))+':'+String(s2).padStart(2,'0');
}
function paintTime(){
  var q=tts.queue||[], c=cumTimes(), total=c[c.length-1]||0;
  if(!q.length){ plTime.textContent=''; plProg.style.width='0'; return; }
  var t=curTime();
  if(tts.idx<0&&!tts.playing) plTime.innerHTML='总时长 约 <b>'+fmt(total)+'</b>';
  else plTime.innerHTML='<b>'+fmt(t)+'</b> / 约 '+fmt(total);
  plProg.style.width=(total?Math.min(100,t/total*100):0)+'%';
}
export function startTick(){ stopTick(); tick=setInterval(paintTime,500); }
export function stopTick(){ if(tick){ clearInterval(tick); tick=0; } }
export function learn(chars,secs){
  if(secs<0.6||chars<16) return;
  var obs=chars*tts.rate/secs, base=BASE_CPS[tts.lang];
  if(obs<base*0.35||obs>base*2.8) return;
  var k=calKey(); cal[k]=cal[k]?cal[k]*0.8+obs*0.2:obs*0.5+base*0.5;
  lsSet('ttsCal',JSON.stringify(cal));
}
export function firstVisible(){
  var q=ensureQueue(), top=parseInt(getComputedStyle(document.documentElement).getPropertyValue('--bar-h'))+8;
  for(var i=0;i<q.length;i++){ var r=q[i].block.getBoundingClientRect(); if(r.bottom>top&&r.height) return i; }
  return 0;
}
function score(v){
  var n=v.name, s=0;
  if(/natural|neural|premium|enhanced|online/i.test(n)) s+=4;
  if(/google/i.test(n)) s+=2;
  if(/^(en-US|zh-CN)$/i.test(v.lang.replace('_','-'))) s+=1;
  return s;
}
function voicesFor(lang){
  return tts.voices.filter(function(v){ return v.lang.toLowerCase().replace('_','-').indexOf(lang)===0; })
    .sort(function(a,b){ return score(b)-score(a)||a.name.localeCompare(b.name); });
}
function pickVoice(){
  var list=voicesFor(tts.lang), want=lsGet('ttsVoice:'+tts.lang,'');
  for(var i=0;i<list.length;i++) if(list[i].voiceURI===want||list[i].name===want) return list[i];
  return list[0]||null;
}
var REGION={'zh-cn':'普通话','zh-tw':'台湾','zh-hk':'粤语','en-us':'US','en-gb':'UK','en-au':'AU','en-in':'IN','en-ca':'CA','en-ie':'IE','en-za':'ZA','en-nz':'NZ'};
function voiceLabel(v){
  var n=v.name.replace(/^Microsoft\s+/,'').replace(/\s*Online\s*\(Natural\)/i,' · 自然').replace(/^Google\s+/,'Google ')
    .replace(/\s*-\s*(English|Chinese).*$/i,'');
  var reg=REGION[v.lang.toLowerCase().replace('_','-')]||v.lang;
  return n+' ('+reg+')';
}
export function fillVoices(){
  tts.voices=synth?(synth.getVoices()||[]):[];
  var list=voicesFor(tts.lang), cur=pickVoice(), sel=voiceSel(), kk=kkAvailable();
  plVoice.innerHTML='';
  function group(label,items){
    var g=document.createElement('optgroup'); g.label=label;
    items.forEach(function(k){ var o=el('option','',k[1]); o.value='kokoro:'+k[0]; if(sel===o.value) o.selected=true; g.appendChild(o); });
    plVoice.appendChild(g);
  }
  if(kk&&tts.lang==='en') group('高品质 · Kokoro 英文语音',KVOICES.en.map(function(k){ return [k[0],k[1]+' · '+k[2]]; }));
  if(kk&&tts.lang==='zh'){
    group('高品质 · 中文女声',KVOICES.zf);
    group('高品质 · 中文男声',KVOICES.zm);
  }
  var host=plVoice;
  if(kk&&list.length){ host=document.createElement('optgroup'); host.label='系统语音'; plVoice.appendChild(host); }
  list.forEach(function(v){ var o=el('option','',voiceLabel(v)); o.value=v.voiceURI||v.name; if(!useKokoro()&&cur&&v===cur) o.selected=true; host.appendChild(o); });
  plVoice.disabled=!list.length&&!kk;
  if(kk){ if(KK.phase!=='loading'&&KK.phase!=='init') note(''); return; }
  if(!list.length){
    var o=el('option','',tts.voices.length?'此设备没有'+(tts.lang==='zh'?'中文':'英文')+'语音':'正在载入语音…'); plVoice.appendChild(o);
    note(tts.voices.length?(tts.lang==='zh'?'没有找到中文语音：可在系统设置 → 语言/辅助功能 → 朗读内容 中添加中文声音后刷新页面。':'没有找到英文语音：可在系统设置中添加后刷新页面。'):'');
  } else note('');
}
export function note(t){ plNote.textContent=t; plNote.hidden=!t; }
export function ttsPaint(){
  var q=tts.queue&&tts.queue[tts.idx];
  [].slice.call(document.querySelectorAll('.tts-fallback')).forEach(function(x){x.classList.remove('tts-fallback');});
  var hasHL=window.CSS&&CSS.highlights&&window.Highlight;
  if(hasHL) CSS.highlights.delete('tts');
  if(!q||!tts.open) return;
  if(!q.block.isConnected){ return; }
  if(hasHL){
    var a=posToDom(q.block,q.s+(tts.char||0)), z=posToDom(q.block,q.e), r=document.createRange();
    try{ r.setStart(a[0],a[1]); r.setEnd(z[0],z[1]); CSS.highlights.set('tts',new Highlight(r)); }catch(e){}
  } else q.block.classList.add('tts-fallback');
}
var lastUserScroll=0;
export function setLastUserScroll(v){ return lastUserScroll=v; }
['wheel','touchmove','keydown'].forEach(function(ev){ window.addEventListener(ev,function(){ lastUserScroll=Date.now(); },{passive:true}); });
export function follow(){
  var q=tts.queue&&tts.queue[tts.idx]; if(!q||Date.now()-lastUserScroll<3500) return;
  var r=q.block.getBoundingClientRect(), top=70, bottom=window.innerHeight-player.offsetHeight-40;
  if(r.top<top||r.top>bottom-24){
    window.scrollTo({top:r.top+window.scrollY-Math.max(top,(bottom-top)*0.3),behavior:'smooth'});
  }
}
function setPlayIcon(){
  var u=plPlay.querySelector('use'); u.setAttribute('href',tts.playing?'#i-pause':'#i-play');
  plPlay.title=tts.playing?'暂停':'播放'; plPlay.setAttribute('aria-label',plPlay.title);
}
export function status(){
  var q=tts.queue||[], n=q.length, i=Math.max(0,tts.idx);
  setPlayIcon();
  paintTime();
  if(!synth&&!useKokoro()){ plStatus.textContent='此浏览器不支持朗读'; return; }
  if(!n){ plStatus.textContent='本篇没有可朗读的'+(tts.lang==='zh'?'中文':'英文')+'内容'; return; }
  if(tts.playing&&useKokoro()&&KK.phase==='loading') plStatus.textContent='正在下载高品质语音 '+KK.pct+'%';
  else if(tts.playing&&useKokoro()&&KK.phase==='init') plStatus.textContent='正在加载语音模型…';
  else if(tts.playing&&useKokoro()&&KK.waiting) plStatus.textContent='正在生成语音 · '+(i+1)+' / '+n;
  else if(tts.playing) plStatus.textContent='正在朗读 · '+(i+1)+' / '+n;
  else if(tts.idx>=0) plStatus.textContent='已暂停 · '+(i+1)+' / '+n;
  else plStatus.textContent='点击正文任意位置，即从该处开始';
}
export function sysSpeakAt(i,off){
  if(!synth) return;
  var q=ensureQueue();
  var my=++tts.token;
  if(i<0) i=0;
  if(i>=q.length){ tts.playing=false; stopTick(); t0=0; tts.idx=-1; tts.char=0; synth.cancel(); ttsPaint(); status(); return; }
  kkStop();
  tts.idx=i; tts.char=off||0; tts.bchar=tts.char; tts.playing=true; t0=0;
  ttsPaint(); status(); follow();
  var item=q[i], text=item.text.slice(tts.char);
  if(!text.trim()){ sysSpeakAt(i+1,0); return; }
  var u=new SpeechSynthesisUtterance(text), v=pickVoice();
  if(v){ u.voice=v; u.lang=v.lang; } else u.lang=tts.lang==='zh'?'zh-CN':'en-US';
  u.rate=tts.rate;
  u.onstart=function(){ if(my!==tts.token) return; tts.errs=0; t0=performance.now(); t0char=tts.char; startTick(); };
  u.onboundary=function(ev){ if(my!==tts.token||typeof ev.charIndex!=='number') return; tts.bchar=tts.char+ev.charIndex; };
  u.onend=function(){ if(my!==tts.token) return; if(t0) learn(item.text.length-t0char,(performance.now()-t0)/1000); t0=0; sysSpeakAt(i+1,0); };
  u.onerror=function(ev){
    if(my!==tts.token||ev.error==='interrupted'||ev.error==='canceled') return;
    if(++tts.errs>=3){ tts.playing=false; status(); note('朗读出错（'+ev.error+'），可换一个旁白声音再试。'); return; }
    sysSpeakAt(i+1,0);
  };
  if(synth.speaking||synth.pending){ synth.cancel(); setTimeout(function(){ if(my===tts.token) synth.speak(u); },60); }
  else synth.speak(u);
}
export function sysPause(){
  tts.token++; tts.playing=false; stopTick(); t0=0;
  if(synth) synth.cancel();
  var q=tts.queue&&tts.queue[tts.idx];
  if(q){ // resume at the start of the word that was being spoken
    var c=Math.max(0,Math.min(tts.bchar,q.text.length));
    if(tts.lang==='en'){ while(c>0&&!/\s/.test(q.text[c-1])) c--; }
    tts.char=c;
  }
  ttsPaint(); status();
}
export function sysPlay(){
  if(!synth) return;
  ensureQueue();
  if(tts.idx<0) sysSpeakAt(firstVisible(),0); else sysSpeakAt(tts.idx,tts.char);
}
