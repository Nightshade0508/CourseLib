// Home, notes, vocabulary, search and other full-page views.
import './vocab.js';
import { MAC, el, esc, lsGet, lsSet, noop } from './util.js';
import { renderDocBody } from './renderers.js';
import { BUILTIN_DOCS, current, db, docsIn, folderList, placement, userDocs } from './state.js';
import { fetchDocJson, setKeepScrollOnce, show } from './show.js';
import { isBuiltin } from './organize.js';
import { buildToc } from './outline.js';
import { BLOCK_SEL, copy, curPane, getBlocks, marks } from './annotations.js';
import { syncSeg } from './motion.js';
import { loadPdfData } from './doc-store.js';
import { uploadPdf } from './upload.js';
import { pdfBodyHtml } from './doc-render.js';
import { SCHED, copyText, docMeta, pageFromMarker, toast } from './citations.js';
import { flashBlock, fmtDate, todayISO } from './study.js';
import { speakWord, vocab } from './vocab.js';
import { progress } from './progress.js';
import { openCmdk } from './palette.js';

var searchQ='';
export function setSearchQ(v){ return searchQ=v; }
export function renderView(id,pane){
  if(id==='view:home') return viewHome(pane);
  if(id==='view:notes') return viewNotes(pane);
  if(id==='view:vocab') return viewVocab(pane);
  if(id==='view:search') return viewSearch(pane);
  pane.innerHTML='';
}
function vHead(title,zh,sub){
  return '<header class="dochead"><p class="eyebrow">'+esc(sub||'学习工具')+'</p><h1 class="dt">'+esc(title)+'</h1><p class="dz">'+esc(zh)+'</p></header>';
}
function weekOf(iso){
  var s=new Date(SCHED.start+'T00:00:00'), d=new Date(iso+'T00:00:00');
  return Math.floor((d-s)/(7*864e5))+1;
}
export function docExists(id){ return BUILTIN_DOCS.some(function(d){return d.id===id && !(placement[id]||{}).hidden;}) || !!userDocs[id]; }
function lecDocs(L){
  var out=[];
  (L.r||[]).forEach(function(r){ if(r.doc&&docExists(r.doc)) out.push(r.doc); });
  Object.keys(userDocs).forEach(function(k){ if(userDocs[k].lec===L.n && out.indexOf(k)<0) out.push(k); });
  return out;
}
function progBar(id){
  var p=progress[id]||{}, pct=p.done?100:Math.round(p.pct||0);
  return '<span class="pbar" title="已读 '+pct+'%"><span style="width:'+pct+'%"></span></span><span class="pnum">'+(p.done?'已读完':pct+'%')+'</span>';
}
// where the reader's content lives right now: this device only, or their account
export function storageNote(){
  var P=window.PTL||{}, u=P.user&&P.user();
  if(u) return '已登录 '+esc(u.email||'')+'：读物、标注和生词会自动同步到你的账号，换设备登录就能接着读。';
  if(P.accounts) return '现在没有登录：文档、标注和生词只保存在这台设备的浏览器里。在侧栏底部登录后，会自动存到云端并在你的设备之间同步。';
  return '文档、标注和生词保存在这台设备的浏览器里，换设备或清除浏览器数据后不会保留，建议定期在侧栏「⋯ → 导出备份」。';
}
function viewHome(pane){
  if(!SCHED.lectures.length) return viewWelcome(pane);
  var today=todayISO(), wk=weekOf(today);
  var lec=SCHED.lectures, upcoming=lec.filter(function(L){ return L.d>=today; }).slice(0,4);
  var thisWeek=lec.filter(function(L){ return weekOf(L.d)===wk; });
  var h=vHead('本周','Data C104 · 第 '+wk+' 周 · '+(SCHED.weeks[wk]||''),'Data C104 · Human Contexts and Ethics of Data');
  h+='<div class="docbody vbody">';
  h+='<h2>This week<span class="zh">本周课程与阅读</span></h2>';
  h+=(thisWeek.length?thisWeek:upcoming).map(function(L){ return lecCard(L,today); }).join('');
  var nxt=lec.filter(function(L){ return weekOf(L.d)===wk+1; });
  if(nxt.length){ h+='<h2>Next week<span class="zh">下周预习 · 第 '+(wk+1)+' 周 · '+esc(SCHED.weeks[wk+1]||'')+'</span></h2>'+nxt.map(function(L){ return lecCard(L,today); }).join(''); }
  // recently read
  var rec=Object.keys(progress).filter(docExists).sort(function(a,b){ return (progress[b].at||0)-(progress[a].at||0); }).slice(0,6);
  if(rec.length){
    h+='<h2>Continue reading<span class="zh">最近在读</span></h2><ul class="v-list">'+rec.map(function(id){ var m=docMeta(id); return '<li><button type="button" class="v-doc" data-open="'+esc(id)+'"><span class="v-t">'+esc(m.title)+'</span>'+progBar(id)+'</button></li>'; }).join('')+'</ul>';
  }
  // vocab due
  var due=Object.keys(vocab).filter(function(k){ return (vocab[k].due||0)<=Date.now(); }).length;
  if(due) h+='<p class="v-tip"><button type="button" class="btn ghost sm" data-open="view:vocab">复习生词（'+due+' 个到期）</button></p>';
  // full schedule
  h+='<h2>Full schedule<span class="zh">全部课表</span></h2><div class="sched">';
  var lastW=0;
  lec.forEach(function(L){
    if(L.w!==lastW){ h+='<div class="sch-w'+(L.w<wk?' past':'')+'">Week '+L.w+' · '+esc(SCHED.weeks[L.w]||'')+'</div>'; lastW=L.w; }
    h+=lecRow(L,today);
  });
  h+='</div><p class="v-src">课表来自 bCourses Schedule（以 bCourses 为准，课程可能调整）。星号阅读 = 讨论课精读必读。</p></div>';
  pane.innerHTML=h;
  wireViewLinks(pane);
}
function viewWelcome(pane){
  var acct=window.PTL&&PTL.account&&PTL.account();
  var h=vHead('首页','中英对照阅读库 · 上传、翻译、精读','Parallel Text Library');
  h+='<div class="docbody vbody">';
  h+='<h2>Getting started<span class="zh">三步开始</span></h2><ol class="v-steps">'+
    '<li><b>AI 账号（可选）</b>：'+(acct?'已登录 '+esc(acct.label)+'。':'不登录也能用免费翻译和查词；登录后译文更准确，还能让 AI 解释段落、生成学习卡片，费用从你自己的账号扣。')+
      ' <button type="button" class="btn ghost sm" data-acct>'+(acct?'账号设置':'登录')+'</button></li>'+
    '<li><b>添加文档</b>：点侧栏底部的「新建」（或按 <kbd>N</kbd>），上传 PDF、Word，粘贴文章，或者直接给一个文章网址。</li>'+
    '<li><b>阅读</b>：译好的段落会先显示；选中文字可以高亮、查词、让 AI 解释，耳机按钮可以本地朗读。</li></ol>';
  var rec=Object.keys(progress).filter(docExists).sort(function(a,b){ return (progress[b].at||0)-(progress[a].at||0); }).slice(0,6);
  if(rec.length){
    h+='<h2>Continue reading<span class="zh">最近在读</span></h2><ul class="v-list">'+rec.map(function(id){ var m=docMeta(id); return '<li><button type="button" class="v-doc" data-open="'+esc(id)+'"><span class="v-t">'+esc(m.title)+'</span>'+progBar(id)+'</button></li>'; }).join('')+'</ul>';
  }
  var due=Object.keys(vocab).filter(function(k){ return (vocab[k].due||0)<=Date.now(); }).length;
  if(due) h+='<p class="v-tip"><button type="button" class="btn ghost sm" data-open="view:vocab">复习生词（'+due+' 个到期）</button></p>';
  var samples=BUILTIN_DOCS.filter(function(d){ return docExists(d.id); });
  if(samples.length){
    h+='<h2>Sample texts<span class="zh">示例读物</span></h2><ul class="v-list">'+samples.map(function(d){ var m=docMeta(d.id); return '<li><button type="button" class="v-doc" data-open="'+esc(d.id)+'"><span class="v-t">'+esc(m.title)+'</span>'+progBar(d.id)+'</button></li>'; }).join('')+'</ul>';
  }
  h+='<p class="v-src">'+storageNote()+'按 <kbd>'+(MAC?'⌘':'Ctrl')+'</kbd> <kbd>K</kbd> 可以随时搜索和执行命令。</p></div>';
  pane.innerHTML=h;
  wireViewLinks(pane);
  var ab=pane.querySelector('[data-acct]'); if(ab) ab.addEventListener('click',function(){ PTL.openAccount(); });
}
function lecCard(L,today){
  var docs=lecDocs(L), past=L.d<today, isToday=L.d===today;
  var h='<div class="lec'+(L.exam?' exam':'')+(past?' past':'')+(isToday?' today':'')+'"><div class="lec-h"><span class="lec-d">'+fmtDate(L.d)+' '+['日','一','二','三','四','五','六'][new Date(L.d+'T00:00:00').getDay()]+'</span>'+
    '<span class="lec-t">'+(L.n?'L'+L.n+' · ':'')+esc(L.t)+'</span>'+(L.slides?'<a class="lec-sl" href="'+esc(L.slides)+'" target="_blank" rel="noopener">讲义 ↗</a>':'')+'</div>';
  if(L.r&&L.r.length){
    h+='<ul class="lec-r">'+L.r.map(function(r){
      var has=r.doc&&docExists(r.doc);
      var right=has?'<button type="button" class="v-doc sm" data-open="'+esc(r.doc)+'">打开 '+progBar(r.doc)+'</button>'
        :(r.url?'<a class="lec-ext" href="'+esc(r.url)+'" target="_blank" rel="noopener">原文 ↗</a>':'')+(db?'<button type="button" class="btn ghost sm" data-up="'+L.n+'">上传 PDF</button>':'');
      return '<li class="'+(r.req?'req':'opt')+'"><span class="lr-t">'+(r.req?'<b class="star" title="讨论课精读">*</b>':'')+esc(r.t)+(r.a?' <span class="lr-a">— '+esc(r.a)+'</span>':'')+'</span><span class="lr-act">'+right+'</span></li>';
    }).join('')+'</ul>';
  } else if(!L.exam) h+='<p class="lec-none">No new readings</p>';
  var extra=Object.keys(userDocs).filter(function(k){ return userDocs[k].lec===L.n; });
  if(extra.length) h+='<ul class="lec-r">'+extra.map(function(k){ return '<li><span class="lr-t">'+esc(userDocs[k].title)+' <span class="lr-a">— 已上传</span></span><span class="lr-act"><button type="button" class="v-doc sm" data-open="'+esc(k)+'">打开 '+progBar(k)+'</button></span></li>'; }).join('')+'</ul>';
  return h+'</div>';
}
function lecRow(L,today){
  var docs=lecDocs(L);
  var req=(L.r||[]).filter(function(r){return r.req;}).map(function(r){return r.a||r.t;}).join('; ');
  return '<div class="sch-row'+(L.d<today?' past':'')+(L.exam?' exam':'')+(L.d===today?' today':'')+'"><span class="sch-d">'+fmtDate(L.d)+'</span><span class="sch-t">'+(L.n?'L'+L.n+' ':'')+esc(L.t)+(req?'<span class="sch-r">'+esc(req)+'</span>':'')+'</span><span class="sch-a">'+
    docs.map(function(id){ var p=progress[id]||{}; return '<button type="button" class="sch-doc'+(p.done?' done':'')+'" data-open="'+esc(id)+'" title="'+esc(docMeta(id).title)+'">'+(p.done?'✓':Math.round(p.pct||0)+'%')+'</button>'; }).join('')+
    (L.slides?'<a class="sch-sl" href="'+esc(L.slides)+'" target="_blank" rel="noopener" title="讲义">讲义</a>':'')+'</span></div>';
}
function wireViewLinks(pane){
  [].slice.call(pane.querySelectorAll('[data-open]')).forEach(function(b){ b.addEventListener('click',function(){ show(b.dataset.open); }); });
  [].slice.call(pane.querySelectorAll('[data-up]')).forEach(function(b){ b.addEventListener('click',function(){ uploadPdf('c104',null,{lec:+b.dataset.up}); }); });
}

/* my annotations */
var TYPE_LABEL={h:'高亮',u:'下划线',b:'加粗',n:'笔记'};
function viewNotes(pane){
  pane.innerHTML=vHead('我的标注','所有读物里的高亮、下划线、加粗和笔记')+'<div class="docbody vbody"><p class="side-note">正在整理…</p></div>';
  collectMarks().then(function(groups){
    if(current!=='view:notes') return;
    var body=pane.querySelector('.vbody');
    if(!groups.length){ body.innerHTML='<p class="v-empty">还没有标注。在任意读物里选中文字，就可以高亮、下划线、加粗或写笔记。</p>'; return; }
    var filt=lsGet('notes-filter','all');
    var h='<div class="v-tools"><div class="seg" id="nfilt">'+[['all','全部'],['n','笔记'],['h','高亮'],['u','下划线'],['b','加粗']].map(function(x){ return '<button type="button" data-f="'+x[0]+'" class="'+(filt===x[0]?'on':'')+'">'+x[1]+'</button>'; }).join('')+'</div>'+
      '<span class="v-sp"></span><button type="button" class="btn ghost sm" id="nx-md">导出 Markdown</button><button type="button" class="btn ghost sm" id="nx-doc">导出 Word</button></div>';
    groups.forEach(function(g){
      var items=g.items.filter(function(it){ return filt==='all'||it.t===filt; }); if(!items.length) return;
      h+='<h2>'+esc(g.title)+'<span class="zh">'+items.length+' 处标注'+(g.author?' · '+esc(g.author):'')+'</span></h2><ul class="n-list">';
      items.forEach(function(it){
        h+='<li class="n-item t-'+it.t+(it.c?' c-'+it.c:'')+'"><button type="button" class="n-go" data-doc="'+esc(g.id)+'" data-b="'+it.b+'"><span class="n-tag">'+TYPE_LABEL[it.t]+(it.page?' · p. '+it.page:'')+'</span><span class="n-x">'+esc(it.x||'（原文已改动）')+'</span>'+(it.note?'<span class="n-note">'+esc(it.note)+'</span>':'')+'</button></li>';
      });
      h+='</ul>';
    });
    body.innerHTML=h;
    [].slice.call(body.querySelectorAll('#nfilt button')).forEach(function(b){ b.addEventListener('click',function(){ lsSet('notes-filter',b.dataset.f); setKeepScrollOnce(true); show('view:notes'); }); });
    [].slice.call(body.querySelectorAll('.n-go')).forEach(function(b){ b.addEventListener('click',function(){ openAt(b.dataset.doc,+b.dataset.b); }); });
    body.querySelector('#nx-md').addEventListener('click',function(){ exportNotes(groups,'md'); });
    body.querySelector('#nx-doc').addEventListener('click',function(){ exportNotes(groups,'doc'); });
    syncSeg(body.querySelector('#nfilt'),true);
    buildToc(pane);
  });
}
/* blocks of any doc, detached: [{el,text,page}] */
var leafCache={};
function docLeaves(id){
  if(leafCache[id]) return Promise.resolve(leafCache[id]);
  var live=document.getElementById(isBuiltin(id)?'doc-'+id:'__none');
  var htmlP;
  if(isBuiltin(id)) htmlP=live?Promise.resolve(live.outerHTML):fetchDocJson(id);
  else {
    var u=userDocs[id]; if(!u) return Promise.resolve([]);
    if(u.format==='pdf') htmlP=loadPdfData(id).then(function(d){ return '<div class="docbody">'+pdfBodyHtml(d)+'</div>'; });
    else htmlP=Promise.resolve('<div class="docbody">'+renderDocBody(u)+'</div>');
  }
  return htmlP.then(function(html){
    var t=document.createElement('template'); t.innerHTML=html;
    var body=t.content.querySelector('.docbody'); if(!body) return [];
    [].slice.call(body.querySelectorAll('.study')).forEach(function(x){x.remove();});
    var leaf=[].slice.call(body.querySelectorAll(BLOCK_SEL)).filter(function(n){ return !n.querySelector(BLOCK_SEL); });
    var page=null, pgs=[].slice.call(body.querySelectorAll('.pg')), pi=0;
    var all=[].slice.call(body.querySelectorAll('.pg, '+BLOCK_SEL));
    var pageOf=new Map();
    all.forEach(function(n){ if(n.classList.contains('pg')){ var p=pageFromMarker(id,n.textContent); if(p) page=p; } else pageOf.set(n,page); });
    var out=leaf.map(function(n){ var p=pageOf.get(n); return {text:n.textContent,page:p&&!p.scan?p.n:null,zh:n.classList.contains('zh')||!!n.closest('.zh')}; });
    leafCache[id]=out; return out;
  }).catch(function(){ return []; });
}
function collectMarks(){
  var byDoc={};
  Object.keys(marks).forEach(function(k){ var m=marks[k]; if(!m||!m.d) return; (byDoc[m.d]=byDoc[m.d]||[]).push(copy(m,{_id:k})); });
  var order=[]; folderList().forEach(function(f){ docsIn(f.id).forEach(function(d){ order.push(d.id); }); });
  var ids=Object.keys(byDoc).filter(docExists).sort(function(a,b){ return order.indexOf(a)-order.indexOf(b); });
  return Promise.all(ids.map(function(id){
    return docLeaves(id).then(function(leaves){
      var items=byDoc[id].map(function(m){ var lf=leaves[m.b]; return {t:m.t,c:m.c,b:m.b,s:m.s,note:m.note||'',x:(lf?lf.text.slice(m.s,m.e):'')||m.x||'',page:lf?lf.page:null,id:m._id}; });
      // merge adjacent pieces of the same mark type in the same block
      items.sort(function(a,b){ return (a.b-b.b)||(a.s-b.s); });
      var meta=docMeta(id);
      return {id:id,title:meta.title,author:meta.author,items:items};
    });
  }));
}
function exportNotes(groups,fmt){
  var date=todayISO(), md='# 我的标注（'+date+'）\n';
  groups.forEach(function(g){
    md+='\n## '+g.title+(g.author?' — '+g.author:'')+'\n\n';
    g.items.forEach(function(it){ md+='- '+(it.t==='n'?'📝 ':'')+'“'+it.x.replace(/\s+/g,' ')+'”'+(it.page?' (p. '+it.page+')':'')+' ['+TYPE_LABEL[it.t]+']'+(it.note?'\n  - 笔记：'+it.note:'')+'\n'; });
  });
  if(fmt==='md') return saveFile('my-annotations-'+date+'.md',md);
  var html='<html><head><meta charset="utf-8"><title>我的标注</title><style>body{font-family:Georgia,"Songti SC",serif;font-size:12pt;line-height:1.5}h1{font-size:18pt}h2{font-size:14pt;margin-top:18pt}li{margin:4pt 0}.n{color:#555}.t{color:#888;font-size:9pt}</style></head><body><h1>我的标注（'+date+'）</h1>';
  groups.forEach(function(g){
    html+='<h2>'+esc(g.title)+(g.author?' — '+esc(g.author):'')+'</h2><ul>';
    g.items.forEach(function(it){ html+='<li>“'+esc(it.x)+'”'+(it.page?' (p. '+it.page+')':'')+' <span class="t">'+TYPE_LABEL[it.t]+'</span>'+(it.note?'<div class="n">笔记：'+esc(it.note)+'</div>':'')+'</li>'; });
    html+='</ul>';
  });
  html+='</body></html>';
  saveFile('my-annotations-'+date+'.doc',html);
}
var dlP=null;
export function saveFile(name,data){
  if(!dlP) dlP=(window.claude&&window.claude.use)?window.claude.use('downloads').catch(function(){return null;}):Promise.resolve(null);
  dlP.then(function(dl){
    if(dl) return dl.save({filename:name,data:data}).then(function(r){ if(r&&r.status==='saved') toast('已保存 '+name); }).catch(function(e){ if(e&&e.code!=='declined'&&e.code!=='cancelled') fallback(); });
    fallback();
  });
  function fallback(){ copyText(typeof data==='string'&&/\.md$/.test(name)?data:String(data)).then(function(){ toast('无法直接下载，已把内容复制到剪贴板'); },function(){ toast('导出失败'); }); }
}

/* vocabulary list + review */
var BOX=[0,1,2,4,8,16,32,64];
function viewVocab(pane){
  var keys=Object.keys(vocab).sort(function(a,b){ return (vocab[b].at||0)-(vocab[a].at||0); });
  var due=keys.filter(function(k){ return (vocab[k].due||0)<=Date.now(); });
  var h=vHead('生词本','在任意读物里双击英文单词即可查词并加入');
  h+='<div class="docbody vbody">';
  if(!keys.length){ pane.innerHTML=h+'<p class="v-empty">还没有生词。阅读时双击一个英文单词（手机上选中单词后点“查词”），就能看到释义并加入生词本。</p></div>'; return; }
  h+='<div class="v-tools"><span class="v-stat">共 '+keys.length+' 个 · 今天到期 '+due.length+' 个</span><span class="v-sp"></span>'+(due.length?'<button type="button" class="btn primary sm" id="vc-rev">开始复习</button>':'<span class="v-ok">今天的复习都完成了</span>')+'<button type="button" class="btn ghost sm" id="vc-md">导出</button></div>';
  h+='<div id="vc-review" hidden></div><ul class="vc-list">'+keys.map(function(k){
    var v=vocab[k];
    return '<li><div class="vl-main"><span class="vl-w">'+esc(v.lemma||v.w)+'</span><span class="vl-ipa">'+esc(v.ipa||'')+'</span><span class="vl-pos">'+esc(v.pos||'')+'</span><span class="vl-zh">'+esc(v.zh||'')+'</span></div><p class="vl-def">'+esc(v.def||'')+'</p>'+(v.ex?'<p class="vl-ex">'+esc(v.ex)+'</p>':'')+
      '<div class="vl-foot">'+(v.doc&&docExists(v.doc)?'<button type="button" class="vl-src" data-open="'+esc(v.doc)+'">'+esc(docMeta(v.doc).title)+'</button>':'')+'<span class="vl-box">熟练度 '+(v.box||0)+'/7</span><button type="button" class="vl-del" data-del="'+esc(k)+'">删除</button></div></li>';
  }).join('')+'</ul></div>';
  pane.innerHTML=h;
  wireViewLinks(pane);
  [].slice.call(pane.querySelectorAll('[data-del]')).forEach(function(b){ b.addEventListener('click',function(){ var k=b.dataset.del; delete vocab[k]; if(db) db.doc('vocab/'+k).delete().catch(noop); setKeepScrollOnce(true); show('view:vocab'); }); });
  var rb=pane.querySelector('#vc-rev'); if(rb) rb.addEventListener('click',function(){ startReview(pane,due); });
  pane.querySelector('#vc-md').addEventListener('click',function(){
    saveFile('vocabulary-'+todayISO()+'.md','# 生词本\n\n'+keys.map(function(k){ var v=vocab[k]; return '- **'+(v.lemma||v.w)+'** '+(v.ipa||'')+' *'+(v.pos||'')+'* — '+(v.zh||'')+'; '+(v.def||'')+(v.ex?'\n  - '+v.ex:''); }).join('\n')+'\n');
  });
}
function startReview(pane,queue){
  queue=queue.slice().sort(function(){ return Math.random()-0.5; });
  var box=pane.querySelector('#vc-review'), list=pane.querySelector('.vc-list'); box.hidden=false; list.hidden=true;
  var i=0;
  function card(){
    if(i>=queue.length){ box.innerHTML='<div class="rv-card done"><p class="rv-w">完成！</p><p class="rv-s">本轮复习了 '+queue.length+' 个词。</p><button type="button" class="btn primary sm" id="rv-end">回到列表</button></div>'; box.querySelector('#rv-end').addEventListener('click',function(){ setKeepScrollOnce(true); show('view:vocab'); }); return; }
    var k=queue[i], v=vocab[k]; if(!v){ i++; return card(); }
    var ex=v.ex?esc(v.ex).replace(new RegExp('\\b('+String(v.w||'').replace(/[^A-Za-z'-]/g,'')+')\\b','i'),'<b>$1</b>'):'';
    box.innerHTML='<div class="rv-card"><p class="rv-n">'+(i+1)+' / '+queue.length+'</p><p class="rv-w">'+esc(v.lemma||v.w)+'</p>'+(ex?'<p class="rv-ex">'+ex+'</p>':'')+
      '<div class="rv-ans" hidden><p class="rv-ipa">'+esc(v.ipa||'')+' · '+esc(v.pos||'')+'</p><p class="rv-zh">'+esc(v.zh||'')+'</p><p class="rv-def">'+esc(v.def||'')+'</p></div>'+
      '<div class="rv-btns"><button type="button" class="btn primary sm" data-r="show">显示答案</button></div></div>';
    box.querySelector('[data-r="show"]').addEventListener('click',function(){
      box.querySelector('.rv-ans').hidden=false;
      var bt=box.querySelector('.rv-btns'); bt.innerHTML='';
      [['again','忘了'],['hard','模糊'],['good','记得']].forEach(function(x){ var b=el('button','btn '+(x[0]==='good'?'primary':'ghost')+' sm',x[1]); b.type='button'; b.addEventListener('click',function(){ grade(k,x[0]); }); bt.appendChild(b); });
      if(window.speechSynthesis) speakWord(v.lemma||v.w);
    });
  }
  function grade(k,g){
    var v=vocab[k], b=v.box||0;
    if(g==='again'){ b=0; v.due=Date.now()+10*60e3; queue.push(k); }
    else if(g==='hard'){ b=Math.max(1,b); v.due=Date.now()+BOX[b]*864e5; }
    else { b=Math.min(7,b+1); v.due=Date.now()+BOX[b]*864e5; }
    v.box=b; if(db) db.doc('vocab/'+k).update({box:b,due:v.due}).catch(noop);
    i++; card();
  }
  card();
}

/* search */
var sIndex=null, sIndexP=null;
function buildIndex(onProg){
  if(sIndex) return Promise.resolve(sIndex);
  if(sIndexP) return sIndexP;
  var ids=[]; folderList().forEach(function(f){ docsIn(f.id).forEach(function(d){ ids.push(d.id); }); });
  var done=0, idx=[];
  sIndexP=Promise.all(ids.map(function(id){
    return docLeaves(id).then(function(leaves){
      leaves.forEach(function(l,bi){ var t=l.text.replace(/\s+/g,' ').trim(); if(t.length>1) idx.push({d:id,b:bi,t:t,lt:t.toLowerCase(),p:l.page}); });
      done++; if(onProg) onProg(done,ids.length);
    });
  })).then(function(){ sIndex=idx; sIndexP=null; return idx; });
  return sIndexP;
}
export function invalidateIndex(){ sIndex=null; leafCache={}; }
function viewSearch(pane){
  pane.innerHTML=vHead('搜索',searchQ?'“'+searchQ+'”':'全部读物 · 中英文')+'<div class="sbox v-sbox"><svg class="ic"><use href="#i-search"></use></svg><input type="search" id="vsq" placeholder="输入关键词，中英文都可以" autocomplete="off"></div><div class="docbody vbody"><p class="side-note" id="s-st">正在建立索引…</p></div>';
  var vin=pane.querySelector('#vsq'), vt=0; vin.value=searchQ;
  vin.addEventListener('input',function(){ clearTimeout(vt); vt=setTimeout(function(){ searchQ=vin.value; setKeepScrollOnce(true); show('view:search'); var n=document.getElementById('vsq'); if(n){ n.focus(); n.setSelectionRange(n.value.length,n.value.length); } },350); });
  var q=searchQ.trim(); if(!q){ pane.querySelector('.vbody').innerHTML='<p class="v-empty">输入关键词搜索全部读物，中英文都可以。</p>'; vin.focus(); return; }
  buildIndex(function(a,b){ var st=pane.querySelector('#s-st'); if(st) st.textContent='正在建立索引 '+a+' / '+b+'…'; }).then(function(idx){
    if(current!=='view:search'||searchQ.trim()!==q) return;
    var terms=q.toLowerCase().split(/\s+/).filter(Boolean);
    var hits=idx.filter(function(e){ return terms.every(function(t){ return e.lt.indexOf(t)>=0; }); });
    var by={}, order=[];
    hits.forEach(function(e){ if(!by[e.d]){ by[e.d]=[]; order.push(e.d); } by[e.d].push(e); });
    var body=pane.querySelector('.vbody');
    if(!hits.length){ body.innerHTML='<p class="v-empty">没有找到包含“'+esc(q)+'”的段落。</p>'; return; }
    var h='<p class="v-stat">'+hits.length+' 处结果，分布在 '+order.length+' 篇读物</p>';
    order.forEach(function(d){
      var list=by[d], m=docMeta(d);
      h+='<h2>'+esc(m.title)+'<span class="zh">'+list.length+' 处</span></h2><ul class="s-list">';
      list.slice(0,12).forEach(function(e){ h+='<li><button type="button" class="s-go" data-doc="'+esc(d)+'" data-b="'+e.b+'">'+(e.p?'<span class="n-tag">p. '+e.p+'</span>':'')+'<span class="s-snip">'+snippet(e.t,terms)+'</span></button></li>'; });
      if(list.length>12) h+='<li class="s-more">还有 '+(list.length-12)+' 处…</li>';
      h+='</ul>';
    });
    body.innerHTML=h;
    [].slice.call(body.querySelectorAll('.s-go')).forEach(function(b){ b.addEventListener('click',function(){ openAt(b.dataset.doc,+b.dataset.b); }); });
    buildToc(pane);
  });
}
function snippet(t,terms){
  var lt=t.toLowerCase(), pos=lt.indexOf(terms[0]), start=Math.max(0,pos-80), s=t.slice(start,start+240);
  var out=esc((start>0?'…':'')+s+(start+240<t.length?'…':''));
  terms.forEach(function(term){ if(!term) return; out=out.replace(new RegExp('('+term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','ig'),'<mark class="s-hit">$1</mark>'); });
  return out;
}
function openAt(id,bi){
  show(id);
  var tries=0;
  (function wait(){
    var pane=curPane();
    var ok=current===id && pane && pane.id!=='viewpane' && pane.querySelector('.docbody') && !pane.querySelector('.doc-loading') && !pane.querySelector('.pdf-wait');
    if(ok){ var bl=getBlocks(pane); if(bl[bi]){ flashBlock(bl[bi]); return; } }
    if(++tries<60) setTimeout(wait,120);
  })();
}

/* sidebar shortcuts + search box (rendered at top of the nav) */
export function navTools(){
  var wrap=el('div','nav-tools');
  var sb=el('button','sbox sbtn'); sb.type='button';
  sb.innerHTML='<svg class="ic"><use href="#i-search"></use></svg><span>搜索或跳转…</span><kbd>'+(MAC?'⌘':'Ctrl ')+'K</kbd>';
  sb.addEventListener('click',function(){ openCmdk(); });
  wrap.appendChild(sb);
  return navToolItems(wrap);
}
function navToolItems(wrap){
  var due=Object.keys(vocab).filter(function(k){ return (vocab[k].due||0)<=Date.now(); }).length;
  var nm=Object.keys(marks).filter(function(k){ return marks[k]&&marks[k].d; }).length;
  [['view:home','home',SCHED.lectures.length?'本周':'首页',''],['view:notes','note','我的标注',nm?String(nm):''],['view:vocab','book','生词本',due?due+' 到期':(Object.keys(vocab).length?String(Object.keys(vocab).length):'')]].forEach(function(x){
    var b=el('button','tool-item'+(current===x[0]?' on':'')); b.type='button';
    b.innerHTML='<svg class="ic"><use href="#i-'+x[1]+'"></use></svg><span>'+x[2]+'</span>'+(x[3]?'<span class="ti-n">'+esc(x[3])+'</span>':'');
    b.addEventListener('click',function(){ show(x[0]); });
    wrap.appendChild(b);
  });
  return wrap;
}
