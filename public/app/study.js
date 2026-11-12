// Per-reading study page: summary, key terms, questions.
import './ai-card.js';
import { el, esc, lsGet, lsSet, noop } from './util.js';
import { current, db } from './state.js';
import { curPane, getBlocks } from './annotations.js';
import { getSample } from './pdf-extract.js';
import { SCHED, copyText, docEnglish, docMeta, lectureOf, sampleErr, toast } from './citations.js';
import { progress } from './progress.js';

var studyCache={}, studyBusy={};
export function courseContext(docId){
  var m=docMeta(docId);
  if(m.course==='c104'){
    var L=lectureOf(docId);
    return 'Course: Data C104 "Human Contexts and Ethics of Data" (UC Berkeley). Course tools: power, sociotechnical systems, positionality, representation, performativity, co-production, agency. '+
      (L?'This reading is assigned for Lecture '+L.n+' "'+L.t+'" (week '+L.w+': '+(SCHED.weeks[L.w]||'')+').':'')+
      ' Lecture topics so far: '+SCHED.lectures.filter(function(x){return x.n&&x.d<=todayISO();}).map(function(x){return x.t;}).join('; ')+'.';
  }
  if(m.course==='r1b') return 'Course: English R1B "Reading and Composition" (UC Berkeley) — close reading, rhetoric, and argumentative essay writing about literature and science writing.';
  return '';
}
export function todayISO(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
export function docHeadActions(pane,id){
  var head=pane.querySelector('.dochead'); if(!head) return;
  var old=head.querySelector('.doc-actions'); if(old) old.remove();
  var row=el('div','doc-actions');
  var b=el('button','btn ghost sm da-study'); b.type='button';
  b.innerHTML='<svg class="ic"><use href="#i-spark"></use></svg><span>学习卡片</span>';
  b.addEventListener('click',function(){ toggleStudy(id); });
  row.appendChild(b);
  var L=lectureOf(id);
  if(L){ var t=el('span','da-lec','Lecture '+L.n+' · '+fmtDate(L.d)+' · '+L.t); row.appendChild(t); }
  var p=progress[id];
  if(p){ var s=el('span','da-prog',p.done?'已读完':('已读 '+Math.round(p.pct||0)+'%')); row.appendChild(s); }
  head.appendChild(row);
  // show stored study section if it was open
  if(studyCache[id]&&lsGet('study-open:'+id,'0')==='1') renderStudy(id);
}
export function fmtDate(iso){ var p=iso.split('-'); return (+p[1])+'/'+(+p[2]); }
function toggleStudy(id){
  var pane=curPane(); if(!pane) return;
  var sec=pane.querySelector('.study');
  if(sec){ sec.remove(); lsSet('study-open:'+id,'0'); return; }
  lsSet('study-open:'+id,'1');
  if(studyCache[id]) return renderStudy(id);
  if(!db){ renderStudyMsg(id,'浏览器禁用了本地存储，无法生成学习卡片。'); return; }
  db.doc('study/'+id).get().then(function(s){
    if(s.exists){ studyCache[id]=s.data(); renderStudy(id); }
    else genStudy(id);
  }).catch(function(){ genStudy(id); });
}
function studyShell(id){
  var pane=curPane(); if(!pane||current!==id) return null;
  var sec=pane.querySelector('.study');
  if(!sec){ sec=el('section','study'); var body=pane.querySelector('.docbody'); body.parentNode.insertBefore(sec,body); }
  return sec;
}
function renderStudyMsg(id,msg,busy){
  var sec=studyShell(id); if(!sec) return;
  sec.innerHTML='<div class="st-head"><h2 class="st-title">Study Card<span class="zh">学习卡片</span></h2></div><p class="st-msg">'+(busy?'<span class="ps-dot"></span> ':'')+esc(msg)+'</p>';
}
function genStudy(id,refresh){
  if(studyBusy[id]) return;
  var pane=curPane(); if(!pane) return;
  var full=docEnglish(pane,id,0);
  if(full.length<200){ renderStudyMsg(id,'这篇的英文内容太少，无法生成学习卡片。'); return; }
  studyBusy[id]=true;
  renderStudyMsg(id,'AI 正在通读全文并整理要点（约 1 分钟）…',true);
  var m=docMeta(id), ctx=courseContext(id);
  getSample().then(function(s){
    if(!s) throw {code:'no_sample'};
    var chunks=[]; var CH=42000;
    if(full.length<=CH) chunks=[full];
    else { var lines=full.split('\n'), cur=''; lines.forEach(function(l){ if(cur.length+l.length>CH){ chunks.push(cur); cur=''; } cur+=l+'\n'; }); if(cur) chunks.push(cur); }
    var notesP;
    if(chunks.length===1) notesP=Promise.resolve(chunks[0]);
    else {
      var acc=[], i=0;
      notesP=(function next(){
        if(i>=chunks.length) return Promise.resolve('NOTES FROM EACH PART (with page tags):\n'+acc.join('\n\n'));
        renderStudyMsg(id,'内容较长，正在分段阅读（第 '+(i+1)+' / '+chunks.length+' 部分）…',true);
        var part=chunks[i++];
        return s('Take dense study notes on this part of an academic reading: the claims, the evidence and examples, key terms, and 4–6 short verbatim quotes (under 30 words each) with their [p. N] page tags. Keep page tags. English only.\n\nReading: "'+m.title+'"'+(m.author?' by '+m.author:'')+'\n\nTEXT:\n'+part,{cache:false}).then(function(r){ acc.push(r.text); return next(); });
      })();
    }
    return notesP.then(function(material){
      var prompt='You are helping a UC Berkeley student prepare for discussion sections and exams. The readings are the main exam material. Build a study card for this reading in clear academic English (with short Chinese glosses only where asked).\n'+
        ctx+'\nReading: "'+m.title+'"'+(m.author?' by '+m.author:'')+'\n'+
        'Page tags like [p. 252] mark printed pages ([p. 4*] = scan page, not a printed page number).\n\n'+
        'Reply with only JSON, exactly this shape:\n'+
        '{"thesis": "1–2 sentences: the author\'s central argument", "thesis_zh": "一句中文概括",\n'+
        ' "args": [{"en": "a main argument or move, 1–2 sentences", "page": "252" }],   // 5–8 items, in the order of the text\n'+
        ' "terms": [{"term": "key term", "zh": "中文译名", "def": "what it means in this reading, 1 sentence"}],   // 5–10 items\n'+
        ' "quotes": [{"q": "verbatim quote copied exactly from the text, under 30 words", "page": "252", "why": "why it matters, 1 sentence"}],   // 4–6 items\n'+
        ' "links": ["how this reading connects to a course concept or another lecture, 1 sentence"],   // 2–4 items\n'+
        ' "questions": ["a likely discussion / warm-up question"]   // 3 items\n}\n'+
        'Use "" for a page you cannot tell. Quotes must be copied exactly, never paraphrased.\n\nTEXT:\n'+material;
      if(prompt.length>60000) prompt=prompt.slice(0,60000);
      renderStudyMsg(id,'正在整理成学习卡片…',true);
      return s.json(prompt,refresh?{cache:false}:{});
    });
  }).then(function(o){
    studyBusy[id]=false;
    if(!o||typeof o!=='object'||!o.thesis) throw {code:'invalid_json'};
    var clean={thesis:String(o.thesis||''),thesis_zh:String(o.thesis_zh||''),
      args:(o.args||[]).slice(0,10).map(function(a){ return {en:String(a.en||a||''),page:String(a.page||'')}; }),
      terms:(o.terms||[]).slice(0,12).map(function(t){ return {term:String(t.term||''),zh:String(t.zh||''),def:String(t.def||'')}; }),
      quotes:(o.quotes||[]).slice(0,8).map(function(q){ return {q:String(q.q||''),page:String(q.page||''),why:String(q.why||'')}; }),
      links:(o.links||[]).slice(0,5).map(String), questions:(o.questions||[]).slice(0,5).map(String), at:new Date().toISOString()};
    // keep only quotes that really occur in the text
    var hay=normQ(docEnglish(curPane(),id,0));
    clean.quotes.forEach(function(q){ q.ok=hay.indexOf(normQ(q.q).slice(0,60))>=0; });
    studyCache[id]=clean;
    if(db) db.doc('study/'+id).set(clean).catch(noop);
    if(current===id) renderStudy(id);
  }).catch(function(e){
    studyBusy[id]=false;
    if(current===id) renderStudyMsg(id,sampleErr(e));
    var sec=studyShell(id); if(sec){ var b=el('button','btn ghost sm','重试'); b.type='button'; b.addEventListener('click',function(){ genStudy(id,true); }); sec.appendChild(b); }
  });
}
function normQ(s){ return String(s||'').toLowerCase().replace(/[“”"‘’'`]/g,'').replace(/[^a-z0-9]+/g,' ').trim(); }
function renderStudy(id){
  var o=studyCache[id], sec=studyShell(id); if(!sec||!o) return;
  var h='<div class="st-head"><h2 class="st-title">Study Card<span class="zh">学习卡片</span></h2><div class="st-act"></div></div>';
  h+='<div class="st-block"><h3>Thesis</h3><p class="st-thesis">'+esc(o.thesis)+'</p>'+(o.thesis_zh?'<p class="st-zh">'+esc(o.thesis_zh)+'</p>':'')+'</div>';
  if(o.args.length) h+='<div class="st-block"><h3>Main arguments</h3><ol class="st-args">'+o.args.map(function(a){ return '<li>'+esc(a.en)+(a.page?' <span class="st-pg">p. '+esc(a.page)+'</span>':'')+'</li>'; }).join('')+'</ol></div>';
  if(o.terms.length) h+='<div class="st-block"><h3>Key terms</h3><dl class="st-terms">'+o.terms.map(function(t){ return '<div><dt>'+esc(t.term)+(t.zh?' <span class="st-zh">'+esc(t.zh)+'</span>':'')+'</dt><dd>'+esc(t.def)+'</dd></div>'; }).join('')+'</dl></div>';
  if(o.quotes.length) h+='<div class="st-block"><h3>Key quotes</h3><ul class="st-quotes">'+o.quotes.map(function(q,i){ return '<li><button type="button" class="st-q" data-qi="'+i+'" title="'+(q.ok?'跳到原文':'原文中未找到完全一致的句子')+'">“'+esc(q.q)+'”</button>'+(q.page?' <span class="st-pg">p. '+esc(q.page)+'</span>':'')+(q.ok===false?' <span class="st-warn">未在原文中核对到</span>':'')+(q.why?'<span class="st-why">'+esc(q.why)+'</span>':'')+'</li>'; }).join('')+'</ul></div>';
  if(o.links&&o.links.length) h+='<div class="st-block"><h3>Course links</h3><ul class="st-links">'+o.links.map(function(x){return '<li>'+esc(x)+'</li>';}).join('')+'</ul></div>';
  if(o.questions&&o.questions.length) h+='<div class="st-block"><h3>Discussion questions</h3><ol class="st-qs">'+o.questions.map(function(x){return '<li>'+esc(x)+'</li>';}).join('')+'</ol></div>';
  h+='<p class="st-meta">由 AI 生成 · '+esc((o.at||'').slice(0,10))+' · 引文已与原文自动核对，页码以原书为准</p>';
  sec.innerHTML=h;
  var act=sec.querySelector('.st-act');
  [['复制 Markdown',function(){ copyText(studyMd(id)).then(function(){toast('已复制');},function(){toast('复制失败');}); }],
   ['重新生成',function(){ studyCache[id]=null; genStudy(id,true); }],
   ['收起',function(){ toggleStudy(id); }]].forEach(function(x){ var b=el('button','btn ghost sm',x[0]); b.type='button'; b.addEventListener('click',x[1]); act.appendChild(b); });
  [].slice.call(sec.querySelectorAll('.st-q')).forEach(function(b){ b.addEventListener('click',function(){ jumpToQuote(id,o.quotes[+b.dataset.qi].q); }); });
}
function studyMd(id){
  var o=studyCache[id], m=docMeta(id); if(!o) return '';
  var s='# '+m.title+(m.author?' — '+m.author:'')+'\n\n## Thesis\n'+o.thesis+(o.thesis_zh?'\n\n'+o.thesis_zh:'')+'\n\n## Main arguments\n'+o.args.map(function(a,i){return (i+1)+'. '+a.en+(a.page?' (p. '+a.page+')':'');}).join('\n')+
    '\n\n## Key terms\n'+o.terms.map(function(t){return '- **'+t.term+'**'+(t.zh?'（'+t.zh+'）':'')+': '+t.def;}).join('\n')+
    '\n\n## Key quotes\n'+o.quotes.map(function(q){return '- “'+q.q+'”'+(q.page?' (p. '+q.page+')':'')+(q.why?' — '+q.why:'');}).join('\n');
  if(o.links&&o.links.length) s+='\n\n## Course links\n'+o.links.map(function(x){return '- '+x;}).join('\n');
  if(o.questions&&o.questions.length) s+='\n\n## Discussion questions\n'+o.questions.map(function(x,i){return (i+1)+'. '+x;}).join('\n');
  return s+'\n';
}
function jumpToQuote(id,q){
  var pane=curPane(); if(!pane) return;
  var key=normQ(q).split(' ').slice(0,8).join(' '), blocks=getBlocks(pane);
  for(var i=0;i<blocks.length;i++){ if(normQ(blocks[i].textContent).indexOf(key)>=0){ flashBlock(blocks[i]); return; } }
  toast('原文中没有找到这句话');
}
export function flashBlock(b){
  var y=b.getBoundingClientRect().top+window.scrollY-110;
  window.scrollTo({top:Math.max(0,y),behavior:'smooth'});
  b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash');
  setTimeout(function(){ b.classList.remove('flash'); },2200);
}
