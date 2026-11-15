// 找资料: search open catalogues for books and papers that may legally be read in full, and decide, for each
// result, whether its full text can be imported or only linked to. Pure functions (no DOM, no network);
// unit-tested in tests/unit/find.test.mjs. The network side is app/find.js.
//
// A result:
//   {key, kind: 'book' | 'paper', title, authors: ['First Last', …], year, venue, doi, abstract, cites, downloads,
//    sources: ['openalex' | 'arxiv' | 'gutenberg' | 'openlibrary'],
//    access: 'import' | 'link', why (Chinese, when only a link), license (Chinese label), note,
//    full: {type: 'arxiv', id} | {type: 'gutenberg', id} | {type: 'pdf', url} | {type: 'page', url} | {type: 'ia', ids: […]},
//    link (the work's own page), authorsRaw (as the catalogue wrote them, for citations)}

export var SOURCE_LABEL={openalex:'OpenAlex',arxiv:'arXiv',gutenberg:'Gutenberg',openlibrary:'Open Library'};

function clean(s){ return String(s==null?'':s).replace(/\s+/g,' ').trim(); }
export function norm(s){ return clean(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9一-鿿]+/g,' ').trim(); }
// "Shelley, Mary Wollstonecraft" → "Mary Wollstonecraft Shelley"
export function firstLast(name){ var m=/^([^,]+),\s*(.+)$/.exec(clean(name)); return m?m[2]+' '+m[1]:clean(name); }
function surname(name){ var p=firstLast(name).split(' '); return p[p.length-1]||''; }

// What the reader typed: a DOI, an arXiv identifier, or words.
export function parseQuery(q){
  q=clean(q);
  var doi=/(?:doi\.org\/|doi:\s*)?(10\.\d{4,9}\/[^\s"<>]+)/i.exec(q);
  if(doi) return {doi:doi[1].replace(/[.,;]+$/,'').toLowerCase()};
  var ax=/(?:arxiv\.org\/(?:abs|pdf|html)\/|arxiv:\s*)?(\d{4}\.\d{4,5})(?:v\d+)?/i.exec(q);
  if(ax&&(/arxiv/i.test(q)||q.replace(ax[0],'').trim()==='')) return {arxiv:ax[1]};
  return {words:q};
}

// ---------- OpenAlex (papers) ----------
// OpenAlex gives abstracts as {word: [positions]}
export function abstractFrom(inv){
  if(!inv) return '';
  var out=[]; Object.keys(inv).forEach(function(w){ inv[w].forEach(function(i){ out[i]=w; }); });
  return clean(out.join(' '));
}
export function arxivIdIn(s){ var m=/arxiv\.org\/(?:abs|pdf|html)\/(\d{4}\.\d{4,5})|10\.48550\/arxiv\.(\d{4}\.\d{4,5})/i.exec(String(s||'')); return m?(m[1]||m[2]):''; }
var LICENSE={'cc-by':'CC BY','cc-by-sa':'CC BY-SA','cc-by-nc':'CC BY-NC','cc-by-nd':'CC BY-ND','cc-by-nc-sa':'CC BY-NC-SA','cc-by-nc-nd':'CC BY-NC-ND','cc0':'CC0','public-domain':'公有领域','pd':'公有领域'};
export function fromOpenAlex(w){
  var doi=clean(w.doi).replace(/^https?:\/\/doi\.org\//i,'').toLowerCase();
  var oa=w.open_access||{}, best=w.best_oa_location||{}, prim=w.primary_location||{};
  var ax=arxivIdIn(doi)||[best.landing_page_url,best.pdf_url,prim.landing_page_url,oa.oa_url].map(arxivIdIn).filter(Boolean)[0]||'';
  var authors=(w.authorships||[]).map(function(a){ return clean(a.author&&a.author.display_name); }).filter(Boolean);
  var r={key:doi?'doi:'+doi:'oa:'+w.id,kind:'paper',title:clean(w.display_name||w.title),authors:authors,year:w.publication_year||null,
    venue:clean((prim.source&&prim.source.display_name)||''),doi:doi,abstract:abstractFrom(w.abstract_inverted_index),cites:w.cited_by_count||0,
    sources:['openalex'],link:doi?'https://doi.org/'+doi:(prim.landing_page_url||w.id),lang:w.language||''};
  if(w.language&&w.language!=='en'){ r.access='link'; r.why='不是英文'; return r; }
  if(ax){ r.arxiv=ax; r.access='import'; r.full={type:'arxiv',id:ax}; r.license='arXiv 预印本'; return r; }
  if(oa.is_oa&&(best.pdf_url||best.landing_page_url)){
    r.access='import';
    r.full=best.pdf_url?{type:'pdf',url:best.pdf_url,page:best.landing_page_url||''}:{type:'page',url:best.landing_page_url};
    r.license=(LICENSE[best.license]||'开放获取')+(best.version==='acceptedVersion'?' · 作者接受稿':best.version==='submittedVersion'?' · 投稿稿':'');
    return r;
  }
  r.access='link'; r.why=oa.is_oa?'开放获取，但没有可读取的全文地址':'需要订阅或付费';
  return r;
}

// ---------- arXiv (papers): its Atom feed, read as text ----------
var STOP={a:1,an:1,the:1,of:1,in:1,on:1,and:1,or:1,to:1,for:1,is:1,are:1,all:1,you:1,we:1,with:1,by:1,from:1,at:1,as:1,be:1,it:1,this:1,that:1,what:1,how:1,why:1,do:1,does:1,not:1};
// arXiv search: the words as a phrase first (finds titles), then the meaningful words all required
export function arxivQueries(words){
  var w=clean(String(words||'').replace(/["()]/g,' ')).toLowerCase();
  var keys=w.split(' ').filter(function(x){ return x.length>1&&!STOP[x]; });
  var out=[];
  if(w.split(' ').length>1) out.push('all:"'+w+'"');
  if(keys.length) out.push(keys.slice(0,6).map(function(k){ return 'all:'+k; }).join(' AND '));
  return out;
}
function xmlText(s){ return clean(String(s||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]+>/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&amp;/g,'&')); }
function tag(xml,name){ var m=new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)</'+name+'>').exec(xml); return m?m[1]:''; }
export function parseArxivFeed(xml){
  var out=[], re=/<entry>([\s\S]*?)<\/entry>/g, m;
  while((m=re.exec(String(xml||'')))){
    var e=m[1], id=arxivIdIn(xmlText(tag(e,'id')));
    if(!id) continue;
    var authors=[], ar=/<author>([\s\S]*?)<\/author>/g, a;
    while((a=ar.exec(e))) authors.push(xmlText(tag(a[1],'name')));
    var doi=xmlText(tag(e,'arxiv:doi')).toLowerCase(), jr=xmlText(tag(e,'arxiv:journal_ref'));
    out.push({key:doi?'doi:'+doi:'doi:10.48550/arxiv.'+id,kind:'paper',title:xmlText(tag(e,'title')),authors:authors,
      year:+(xmlText(tag(e,'published')).slice(0,4))||null,venue:jr||'arXiv',doi:doi||('10.48550/arxiv.'+id),arxiv:id,
      abstract:xmlText(tag(e,'summary')),cites:0,sources:['arxiv'],access:'import',full:{type:'arxiv',id:id},license:'arXiv 预印本',
      link:'https://arxiv.org/abs/'+id});
  }
  return out;
}

// ---------- Gutendex / Project Gutenberg (books) ----------
export function fromGutendex(b){
  var authors=(b.authors||[]).map(function(a){ return firstLast(a.name); });
  var en=(b.languages||[]).indexOf('en')>=0;
  var r={key:'book:'+norm(b.title).split(' ').slice(0,6).join(' ')+'|'+norm(surname((b.authors[0]||{}).name||'')),kind:'book',
    title:clean(b.title).replace(/\s*;\s*or,\s*/i,'; or, '),authors:authors,authorsRaw:(b.authors||[]).map(function(a){ return clean(a.name); }),year:null,
    downloads:b.download_count||0,sources:['gutenberg'],gutenberg:b.id,link:'https://www.gutenberg.org/ebooks/'+b.id,
    note:'在美国属于公有领域；其他国家或地区的版权期限可能不同'};
  if(b.copyright){ r.access='link'; r.why='仍受版权保护'; return r; }
  if(!en){ r.access='link'; r.why='不是英文'; return r; }
  r.access='import'; r.full={type:'gutenberg',id:b.id}; r.license='公有领域';
  return r;
}

// ---------- Open Library (books; public scans live on the Internet Archive) ----------
export function fromOpenLibrary(d){
  var authors=(d.author_name||[]).map(clean);
  var r={key:'book:'+norm(d.title).split(' ').slice(0,6).join(' ')+'|'+norm(surname(authors[0]||'')),kind:'book',
    title:clean(d.title),authors:authors,year:d.first_publish_year||null,sources:['openlibrary'],editions:d.edition_count||0,
    link:'https://openlibrary.org'+d.key};
  var langs=d.language||[], en=!langs.length||langs.indexOf('eng')>=0;
  var gut=(d.id_project_gutenberg||[])[0];
  if(!en){ r.access='link'; r.why='不是英文'; return r; }
  if(d.ebook_access==='public'&&gut){ r.access='import'; r.gutenberg=+gut; r.full={type:'gutenberg',id:+gut}; r.license='公有领域'; r.sources.push('gutenberg'); return r; }
  if(d.ebook_access==='public'&&(d.ia||[]).length){ r.access='import'; r.full={type:'ia',ids:d.ia.slice(0,6)}; r.license='公有领域 · 扫描本'; r.note='文字由扫描识别（OCR）得来，可能有错字'; return r; }
  r.access='link';
  r.why={borrowable:'受版权保护，可以在 Open Library 借阅',printdisabled:'仅向有阅读障碍的读者开放',no_ebook:'没有电子版'}[d.ebook_access]||'没有可读取的全文';
  return r;
}

// ---------- one list from many sources ----------
var PREF={arxiv:4,gutenberg:3,pdf:2,page:2,ia:1};
// Same work from several catalogues → one result that keeps the best way to the full text and everyone's details.
export function merge(results){
  var by={}, order=[];
  results.forEach(function(r){
    var k=r.key, cur=by[k];
    if(!cur){ by[k]=Object.assign({},r,{sources:r.sources.slice()}); order.push(k); return; }
    r.sources.forEach(function(s){ if(cur.sources.indexOf(s)<0) cur.sources.push(s); });
    ['year','venue','abstract','doi','arxiv','gutenberg','authorsRaw','editions'].forEach(function(f){ if(!cur[f]&&r[f]) cur[f]=r[f]; });
    if(r.year&&cur.year&&r.year<cur.year&&r.kind==='book') cur.year=r.year;               // a book's first publication
    cur.cites=Math.max(cur.cites||0,r.cites||0); cur.downloads=Math.max(cur.downloads||0,r.downloads||0);
    if(r.authors.length>cur.authors.length) cur.authors=r.authors;
    var better=r.access==='import'&&(cur.access!=='import'||(PREF[r.full.type]||0)>(PREF[cur.full.type]||0));
    if(better){ ['access','full','license','note'].forEach(function(f){ cur[f]=r[f]; }); delete cur.why; if(r.kind==='paper') cur.link=cur.link||r.link; }
  });
  return order.map(function(k){ return by[k]; });
}
// How well the title (and authors) match comes first; importable full text and how much a work is read or
// cited break the ties between similar matches.
export function rank(results,q){
  var words=norm(q).split(' ').filter(function(w){ return w.length>1; });
  function score(r){
    var t=norm(r.title), a=norm(r.authors.join(' ')), s=0;
    if(words.length&&words.every(function(w){ return t.indexOf(w)>=0; })) s+=4;
    else s+=2*words.filter(function(w){ return t.indexOf(w)>=0; }).length/Math.max(1,words.length);
    s+=words.filter(function(w){ return a.indexOf(w)>=0; }).length/Math.max(1,words.length);
    if(norm(q)===t) s+=3;
    s+=Math.min(2,Math.log10(1+(r.cites||0)+(r.downloads||0)/20+(r.editions||0))/2);
    if(r.access==='import') s+=3+({gutenberg:1.5,arxiv:1,pdf:0.5,page:0.5,ia:0}[r.full&&r.full.type]||0);
    if(r.sources.length>1) s+=0.3;
    return s;
  }
  return results.map(function(r,i){ return {r:r,s:score(r),i:i}; }).sort(function(a,b){ return (b.s-a.s)||(a.i-b.i); }).map(function(x){ return x.r; });
}

// ---------- full text ----------
// Plain-text Gutenberg files carry a licence header and footer around the book itself
export function stripGutenberg(text){
  var t=String(text||''), a=/\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG[^\n]*\n/i.exec(t), b=/\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG/i.exec(t);
  if(a) t=t.slice(a.index+a[0].length);
  if(b){ var e=/\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG/i.exec(t); if(e) t=t.slice(0,e.index); }
  return t.replace(/^\s+|\s+$/g,'');
}
var CHAPTER_RE=/^(?:chapter|letter|book|part|act|scene|canto|section|volume|stave|preface|introduction|prologue|epilogue|appendix|conclusion)\b|^[ivxlcdm]+\.?$|^\d{1,3}\.?$/i;
// Blocks of a whole book → chapters [{title, blocks, words}]. The chapter level is the heading level whose
// headings look like chapter titles (or, failing that, the one that cuts the book into the most sizeable parts).
export function splitChapters(blocks,opts){
  opts=opts||{};
  var min=opts.min||600, heads=[];
  blocks.forEach(function(b,i){ if(b.k==='h') heads.push(i); });
  function partsAt(level){
    var cuts=heads.filter(function(i){ return (blocks[i].lv||2)===level; });
    var parts=[], cur=null, lead=[];
    blocks.forEach(function(b,i){
      if(cuts.indexOf(i)>=0){ cur={title:b.en,blocks:[]}; parts.push(cur); return; }
      (cur?cur.blocks:lead).push(b);
    });
    parts.forEach(function(p){ p.words=wordsIn(p.blocks); });
    return {parts:parts,lead:lead};
  }
  var levels=[]; heads.forEach(function(i){ var lv=blocks[i].lv||2; if(levels.indexOf(lv)<0) levels.push(lv); });
  var best=null;
  levels.forEach(function(lv){
    var r=partsAt(lv), big=r.parts.filter(function(p){ return p.words>=min; }).length;
    var named=r.parts.filter(function(p){ return CHAPTER_RE.test(clean(p.title)); }).length;
    var sc=named*3+big;
    if(r.parts.length>=2&&(!best||sc>best.sc)) best={sc:sc,r:r};
  });
  if(!best){ var all=blocks.filter(function(b,i){ return !(i===0&&b.k==='h'); }); return [{title:opts.title||'全文',blocks:all,words:wordsIn(all)}]; }
  var parts=best.r.parts.slice(), lead=best.r.lead.slice();
  function chapterish(p){ return CHAPTER_RE.test(clean(p.title)); }
  // tiny unnamed parts before the first real chapter are the title page ("by A. Writer"): they join the opening
  while(parts.length>1&&parts[0].words<40&&!chapterish(parts[0])) lead=lead.concat(parts.shift().blocks);
  // a short opening (title page, epigraph) joins the first chapter; a long one becomes its own part
  if(wordsIn(lead)>=min) parts.unshift({title:opts.leadTitle||'开篇',blocks:lead,words:wordsIn(lead)});
  else if(parts.length) parts[0].blocks=lead.filter(function(b){ return b.k!=='h'; }).concat(parts[0].blocks);
  // tiny unnamed parts later on (a heading with a line under it) merge into the next part; named chapters stay
  var out=[];
  parts.forEach(function(p,i){
    if(p.words<40&&!chapterish(p)&&i<parts.length-1){ parts[i+1].blocks=[{k:'h',en:p.title}].concat(p.blocks,parts[i+1].blocks); parts[i+1].words+=p.words; return; }
    out.push(p);
  });
  out.forEach(function(p){ p.words=wordsIn(p.blocks); });
  return out;
}
export function wordsIn(blocks){ var n=0; blocks.forEach(function(b){ if(b.k!=='img'&&b.k!=='ref') n+=(String(b.en).match(/[A-Za-z0-9’'-]+/g)||[]).length; }); return n; }
// OCR text (Internet Archive): lines → paragraphs and chapter headings. Dropped: page numbers, running heads
// (short lines in capitals, or any short line repeated on many pages) and scanning noise; paragraphs that a page
// break cut in two are joined again.
var OCR_HEAD=/^(?:(?:CHAPTER|LETTER|BOOK|PART|VOLUME|CANTO|STAVE)\s+(?:[IVXLCDM]+|\d+|[A-Z]+)|PREFACE|INTRODUCTION|CONCLUSION|APPENDIX|EPILOGUE|PROLOGUE)\s*[.:]?$|^(?:Chapter|Letter|Book|Part|Volume)\s+(?:[IVXLCDM]+|\d+|[A-Z][a-z]+)\s*[.:]?$/;
function wordy(t){
  var toks=t.split(' '), good=toks.filter(function(w){ return /^["“‘'(\[]*[A-Za-z][a-z'’-]*[.,;:!?”"’')\]]*$/.test(w)||/^[A-Z][A-Za-z.'’-]*[.,;:!?”"’')]*$/.test(w)||/^\d+[.,;:]?$/.test(w); }).length;
  return toks.length>=3&&good/toks.length>=0.7;
}
export function ocrBlocks(text){
  var lines=String(text||'').replace(/\r/g,'').split('\n').map(clean), seen={};
  lines.forEach(function(l){ if(l&&l.length<45) seen[l]=(seen[l]||0)+1; });
  var out=[], buf=[], lastHead='';
  function flush(){
    if(!buf.length) return;
    var t=clean(buf.join(' ').replace(/(\w)-\s+([a-z])/g,'$1$2')); buf=[];
    if(!wordy(t)) return;
    var prev=out[out.length-1];
    if(prev&&prev.k==='p'&&!/[.!?"”’')\]:]$/.test(prev.en)&&/^[a-z]/.test(t)) prev.en+=' '+t;     // a paragraph split by a page break
    else out.push({k:'p',en:t});
  }
  lines.forEach(function(t){
    if(!t){ flush(); return; }
    if(OCR_HEAD.test(t.replace(/\s+/g,' '))){
      var h=t.replace(/\s+/g,' ').replace(/\s*[.:]$/,'');
      if(h===lastHead) return;                                                        // the same heading on every page: a running head
      flush(); out.push({k:'h',en:h,lv:2}); lastHead=h; return;
    }
    if(/^[\[(]?\d{1,4}[\])]?$/.test(t)) return;                                       // page numbers
    var letters=t.replace(/[^A-Za-z]/g,''), caps=t.replace(/[^A-Z]/g,'').length;
    if(t.length<50&&letters.length>=3&&caps/letters.length>0.7) return;               // running heads in capitals
    if(t.length<45&&seen[t]>=4) return;                                                // anything repeated page after page
    buf.push(t);
  });
  flush();
  return out;
}

// ---------- citations ----------
function mlaNames(names){
  names=names.filter(Boolean);
  if(!names.length) return '';
  var first=names[0].indexOf(',')>0?names[0]:(function(n){ var p=n.split(' '); return p.length>1?p[p.length-1]+', '+p.slice(0,-1).join(' '):n; })(names[0]);
  if(names.length===1) return first+'. ';
  if(names.length===2) return first+', and '+firstLast(names[1])+'. ';
  return first+', et al. ';
}
function esc(s){ return String(s).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
// MLA 9 "Works Cited" entry (HTML, titles in <i>) and the name for in-text citations
export function citation(r){
  var names=r.authorsRaw&&r.authorsRaw.length?r.authorsRaw:r.authors, a=mlaNames(names);
  var lead=names.length?surname(names[0])+(names.length===2?' and '+surname(names[1]):names.length>2?' et al.':''):'';
  var mla;
  if(r.kind==='book'){
    var where=r.full&&r.full.type==='gutenberg'?' Project Gutenberg, www.gutenberg.org/ebooks/'+r.full.id+'.':r.link?' '+r.link.replace(/^https?:\/\//,'')+'.':'';
    mla=esc(a)+'<i>'+esc(r.title)+'</i>.'+(r.year?' '+r.year+'.':'')+esc(where);
  } else {
    mla=esc(a)+'“'+esc(r.title.replace(/\.$/,''))+'.” <i>'+esc(r.venue||'arXiv')+'</i>,'+(r.year?' '+r.year+',':'')+' '+esc(r.doi?'https://doi.org/'+r.doi:r.link)+'.';
  }
  return {mla:mla.replace(/\s+/g,' ').trim(),citeA:lead};
}
