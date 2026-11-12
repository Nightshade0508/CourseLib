// Course schedule, bibliography, page labels and MLA citations.
import './doc-render.js';
import { el, esc, noop } from './util.js';
import { BUILTIN_DOCS, db, placement, userDocs } from './state.js';
import { curPane } from './annotations.js';
import { getSample } from './pdf-extract.js';

export var SCHED=window.__SCHED__||{lectures:[],weeks:{}};
var BIB={
  bowker:{a:'Bowker and Star',mla:'Bowker, Geoffrey C., and Susan Leigh Star. “The Case of Race Classification and Reclassification under Apartheid.” <i>Sorting Things Out: Classification and Its Consequences</i>, MIT Press, 1999, pp. 195–225.',off:194},
  picciotto:{a:'Picciotto',mla:'Picciotto, Joanna. “Introduction.” <i>Labors of Innocence in Early Modern England</i>, Harvard UP, 2010.'},
  wordsworth:{a:'Wordsworth',mla:'Wordsworth, William. <i>Selected Poems</i>. 1798–1824.',verse:true},
  stein:{a:'Stein',mla:'Stein, Gertrude. <i>Tender Buttons: Objects, Food, Rooms</i>. Claire Marie, 1914.'},
  scott:{a:'Scott',mla:'Scott, James C. “Nature and Space.” <i>Seeing Like a State: How Certain Schemes to Improve the Human Condition Have Failed</i>, Yale UP, 1998, pp. 11–33.'},
  brooks:{a:'Brooks',mla:'Brooks, Andrew. “Why Are Certain Countries Poor? Dismantling Comparative Models of Development.” <i>Bullshit Comparisons</i>, Footnote Press, 2024.'},
  nautilus:{a:'Clayton',mla:'Clayton, Aubrey. “How Eugenics Shaped Statistics.” <i>Nautilus</i>, 28 Oct. 2020.'},
  collins:{a:'Collins and Pinch',mla:'Collins, Harry, and Trevor Pinch. “The Science of the Lambs: Chernobyl and the Cumbrian Sheep Farmers.” <i>The Golem at Large: What You Should Know about Technology</i>, Cambridge UP, 2002.'},
  kuhn:{a:'Kuhn',mla:'Kuhn, Thomas S. <i>The Structure of Scientific Revolutions</i>. 2nd ed., U of Chicago P, 1970.'},
  micrographia:{a:'Hooke',mla:'Hooke, Robert. <i>Micrographia</i>. London, 1665.'},
  gross:{a:'Gross',mla:'Gross, Alan G. “Does Rhetoric of Science Matter? The Case of the Floppy-Eared Rabbits.” <i>College English</i>, vol. 53, no. 8, 1991, pp. 933–43.'},
  white:{a:'White',mla:'White, Gilbert. <i>The Journals of Gilbert White</i>. Vol. 2, 1774–1783.'},
  paterson:{a:'Williams',mla:'Williams, William Carlos. <i>Paterson</i>. Penguin.'},
  cecire:{a:'Cecire',mla:'Cecire, Natalie. <i>Experimental: American Literature and the Aesthetics of Knowledge</i>. Johns Hopkins UP, 2019.'},
  pressly:{a:'Pressly',mla:'Pressly, Lowry. “Introduction.” <i>The Right to Oblivion: Privacy and the Good Life</i>, Harvard UP, 2024, pp. 1–22.'},
  malkin:{a:'Malkin',mla:'Malkin, Nathan. “Contextual Integrity, Explained: A More Usable Privacy Definition.” <i>IEEE Security &amp; Privacy</i>, vol. 21, no. 1, 2023, pp. 58–65.'},
  porter:{a:'Porter',mla:'Porter, Theodore M. “Objectivity and Authority: How French Engineers Reduced Public Utility to Numbers.” <i>Poetics Today</i>, vol. 12, no. 2, 1991, pp. 245–65.'},
  foucault:{a:'Foucault',mla:'Foucault, Michel. “Panopticism.” Translated by Alan Sheridan. <i>Race/Ethnicity: Multidisciplinary Global Contexts</i>, vol. 2, no. 1, 2008, pp. 1–12.'},
  snail:{a:'Moore',mla:'Moore, Marianne. “To a Snail.” <i>Observations</i>, Dial Press, 1924.',verse:true},
  crawford:{a:'Crawford',mla:'Crawford, Margo Natalie. “<i>Mood</i> Books: The Textual Production of Black Feeling.” <i>The Langston Hughes Review</i>, vol. 25, no. 2, 2019, pp. 162–78.'},
  octopus:{a:'Moore',mla:'Moore, Marianne. “An Octopus.” <i>Observations</i>, Dial Press, 1924.',verse:true}
};
export function docMeta(id){
  var b=null; BUILTIN_DOCS.forEach(function(d){ if(d.id===id) b=d; });
  var pl=placement[id]||{}, u=userDocs[id];
  if(b){
    var pane=document.getElementById('doc-'+id), au=pane&&pane.querySelector('.dauth');
    return {id:id,builtin:true,title:pl.title||b.title,zh:b.zh,author:au?au.textContent:'',course:pl.folder||b.course};
  }
  if(u) return {id:id,builtin:false,title:u.title,zh:u.zh||'',author:u.author||'',course:u.folder,u:u};
  return {id:id,title:id,author:'',course:''};
}
export function lectureOf(id){
  var hit=null;
  SCHED.lectures.forEach(function(L){ (L.r||[]).forEach(function(r){ if(r.doc===id) hit=L; }); });
  var u=userDocs[id]; if(!hit && u && u.lec){ SCHED.lectures.forEach(function(L){ if(L.n===u.lec) hit=L; }); }
  return hit;
}
/* page label for a .pg marker text */
export function pageFromMarker(docId,txt){
  txt=String(txt||'');
  var m=/扫描件\s*第\s*(\d+)\s*页/.exec(txt);
  if(m){ var off=(BIB[docId]||{}).off; return off!=null?{n:+m[1]+off}:{n:+m[1],scan:true}; }
  m=/(?:原书|原刊|原文)\s*第\s*(\d+)\s*页/.exec(txt); if(m) return {n:+m[1]};
  m=/^Page\s+(\d+)/.exec(txt); if(m) return {n:+m[1]};
  m=/(?:PDF|课程 PDF)\s*第\s*(\d+)\s*页/.exec(txt); if(m) return {n:+m[1],scan:true};
  return null;
}
/* page of a node inside a docbody: nearest preceding .pg */
export function pageOfNode(node,docId){
  var body=node&&node.closest&&node.closest('.docbody'); if(!body) return null;
  var pgs=[].slice.call(body.querySelectorAll('.pg')), best=null;
  for(var i=0;i<pgs.length;i++){
    if(pgs[i].compareDocumentPosition(node)&Node.DOCUMENT_POSITION_FOLLOWING) best=pgs[i]; else break;
  }
  return best?pageFromMarker(docId,best.textContent):null;
}
export function lineOfNode(node){
  var tr=node&&node.closest&&node.closest('table.verse tr'); if(!tr) return null;
  var body=tr.closest('.docbody'), n=0, found=null;
  var walker=[].slice.call(body.querySelectorAll('h2.poem, table.verse tr'));
  walker.forEach(function(x){ if(found) return; if(x.tagName==='H2'){ n=0; return; } n++; if(x===tr) found=n; });
  return found;
}
/* English text of a doc with page tags, for prompts */
export function docEnglish(pane,docId,maxChars){
  var body=pane&&pane.querySelector('.docbody'); if(!body) return '';
  var out=[], page=null, total=0;
  var nodes=body.querySelectorAll('.pg, .pair, h2, h3, table.verse tr, .docbody > p:not(.src), ul.refs li');
  for(var i=0;i<nodes.length;i++){
    var n=nodes[i];
    if(n.classList.contains('pg')){ var pg=pageFromMarker(docId,n.textContent); if(pg) page=pg; continue; }
    if(n.closest('.study')) continue;
    var t='';
    if(n.matches('.pair')){ var e=n.querySelector('.en'); if(!e){ if(n.querySelector('.zh')) continue; t=n.textContent; } else t=e.textContent; }
    else if(n.matches('h2,h3')){ var c=n.cloneNode(true); [].slice.call(c.querySelectorAll('.zh')).forEach(function(z){z.remove();}); t='## '+c.textContent; }
    else if(n.matches('tr')){ var td=n.querySelector('td.en'); t=td?td.textContent:''; }
    else if(n.matches('li')) continue;
    else t=n.textContent;
    t=t.replace(/\s+/g,' ').trim(); if(!t) continue;
    if(/[一-鿿]/.test(t) && !/[a-z]{3,}/i.test(t)) continue;
    var line=(page?'[p. '+page.n+(page.scan?'*':'')+'] ':'')+t;
    out.push(line); total+=line.length+1;
    if(maxChars && total>maxChars) break;
  }
  return out.join('\n');
}
/* MLA */
export function inText(docId,loc){
  var b=BIB[docId], u=userDocs[docId], a=b?b.a:((u&&u.citeA)||lastName(docMeta(docId).author)||docMeta(docId).title);
  if(loc&&loc.line) return '('+a+', line'+(loc.line2&&loc.line2!==loc.line?'s '+loc.line+'–'+loc.line2:' '+loc.line)+')';
  if(loc&&loc.page&&!loc.page.scan) return '('+a+' '+loc.page.n+(loc.page2&&loc.page2.n!==loc.page.n?'–'+loc.page2.n:'')+')';
  return '('+a+')';
}
function lastName(s){
  s=String(s||'').split(/·|\(|,| and |&/)[0].trim(); if(!s) return '';
  var p=s.split(/\s+/); return p[p.length-1];
}
export function worksCited(docId){
  var b=BIB[docId]; if(b) return Promise.resolve(b.mla);
  var u=userDocs[docId]; if(!u) return Promise.resolve('');
  if(u.mla) return Promise.resolve(u.mla);
  return getSample().then(function(s){
    if(!s) return '';
    var pane=curPane(), txt=docEnglish(pane,docId,2500);
    return s.json('Write the MLA 9 Works Cited entry for this reading, using only information visible below (omit unknown parts; never invent page ranges or dates). Also give the author surname(s) for in-text citations (e.g. "Porter" or "Bowker and Star").\n'+
      'Reply with only JSON: {"mla": "...", "intext": "..."} . Use <i>…</i> for italic titles.\n\nLibrary title: '+u.title+'\nAuthor field: '+(u.author||'')+'\nFile name: '+((u.src&&u.src.name)||'')+'\n\nBeginning of the text:\n'+txt,{modelTier:'quick'}).then(function(o){
      var mla=String((o&&o.mla)||'').replace(/<(?!\/?i>)[^>]*>/g,'').trim(), it=String((o&&o.intext)||'').trim();
      if(mla&&db) db.doc('docs/'+docId).update({mla:mla,citeA:it||lastName(u.author)}).catch(noop);
      if(userDocs[docId]){ userDocs[docId].mla=mla; if(it) userDocs[docId].citeA=it; }
      return mla;
    });
  }).catch(function(){ return ''; });
}
export function copyText(t){
  if(navigator.clipboard&&navigator.clipboard.writeText) return navigator.clipboard.writeText(t).catch(function(){ return legacyCopy(t); });
  return Promise.resolve(legacyCopy(t));
}
function legacyCopy(t){
  var ta=document.createElement('textarea'); ta.value=t; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select();
  var ok=false; try{ ok=document.execCommand('copy'); }catch(e){} ta.remove(); if(!ok) throw new Error('copy failed');
}
export function toast(msg){
  var t=document.getElementById('toast'); if(!t){ t=el('div','toast'); t.id='toast'; t.setAttribute('role','status'); document.body.appendChild(t); }
  t.textContent=msg; t.classList.remove('out'); t.hidden=false; clearTimeout(t._h);
  t._h=setTimeout(function(){ t.classList.add('out'); setTimeout(function(){ t.hidden=true; },220); },2200);
}
/* tiny markdown for AI answers */
export function mdLite(s){
  var lines=String(s||'').split('\n'), out=[], list=null;
  function closeList(){ if(list){ out.push('</'+list+'>'); list=null; } }
  lines.forEach(function(l){
    var m;
    if(/^\s*$/.test(l)){ closeList(); return; }
    if((m=/^\s*#{1,4}\s+(.*)$/.exec(l))){ closeList(); out.push('<h4>'+inl(m[1])+'</h4>'); return; }
    if((m=/^\s*[-*•]\s+(.*)$/.exec(l))){ if(list!=='ul'){ closeList(); out.push('<ul>'); list='ul'; } out.push('<li>'+inl(m[1])+'</li>'); return; }
    if((m=/^\s*\d+[.)]\s+(.*)$/.exec(l))){ if(list!=='ol'){ closeList(); out.push('<ol>'); list='ol'; } out.push('<li>'+inl(m[1])+'</li>'); return; }
    closeList(); out.push('<p>'+inl(l)+'</p>');
  });
  closeList(); return out.join('');
  function inl(x){ return esc(x).replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g,'$1<i>$2</i>').replace(/`([^`]+)`/g,'<code>$1</code>'); }
}
export function sampleErr(e){
  var c=(e&&e.code)||'';
  return ({not_signed_in:'请先登录你的 AI 账号（侧栏底部「AI 账号」）。',no_credits:'AI 账号余额不足，请充值后再试。',not_granted:'AI 账号的密钥无效或已失效，请重新登录。',sampling_disabled:'当前账号无法在页面里使用 Claude。',rate_limited:'用得太频繁或达到用量上限，稍后再试。',
    refused:'AI 拒绝回答这段内容。',prompt_too_large:'内容太长了。',session_expired:'AI 账号登录已过期，请重新登录。',invalid_json:'返回格式有误，请再试一次。',not_found:'没有在免费词典里找到这个词。登录 AI 账号后可以按上下文解释。',mt_failed:'免费翻译模型没能加载，请检查网络后重试。',cancelled:'已取消。'})[c]
    ||('出错了：'+((e&&e.message)||'请稍后再试'));
}
