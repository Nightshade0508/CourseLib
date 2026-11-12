// Read a PDF: text layer → lines → paragraphs, headings, footnotes; OCR for scans.
import './motion.js';
import { noop } from './util.js';
import { setStat } from './doc-store.js';

export var pdfMem={}, pdfJobs={};
var sampleP=null;
export function absUrl(p){ return new URL(p,document.baseURI).href; }
export function getSample(){
  if(!sampleP){
    sampleP=(window.claude&&window.claude.use)?window.claude.use('sample').catch(function(){return null;}):Promise.resolve(null);
  }
  return sampleP;
}
var pdfLibP=null;
function loadPdfJs(){
  if(!pdfLibP){
    pdfLibP=import(absUrl('pdfjs/pdf.min.mjs')).then(function(m){
      m.GlobalWorkerOptions.workerSrc=absUrl('pdfjs/pdf.worker.min.mjs'); return m;
    });
    pdfLibP.catch(function(){ pdfLibP=null; });
  }
  return pdfLibP;
}
function median(a){ if(!a.length) return 0; var b=a.slice().sort(function(x,y){return x-y;}); return b[Math.floor(b.length/2)]; }
function pct(a,q){ if(!a.length) return 0; var b=a.slice().sort(function(x,y){return x-y;}); return b[Math.min(b.length-1,Math.floor(b.length*q))]; }
var JUNK_RE=/This content downloaded from|All use subject to|about\.jstor\.org\/terms|^\s*Downloaded from\b|muse\.jhu\.edu|For personal use only|Provided by .*Library|^\s*Copyright\s*(©|\?|\(c\))?\s*\d{4}/i;
var COVER_RE=/JSTOR is a not-for-profit service|Your use of the JSTOR archive|For additional information about this article|muse\.jhu\.edu\/article|Linked references are available on JSTOR/i;
var REFS_RE=/^(references|works cited|bibliography|literature cited|sources cited|参考文献)\.?$/i;
var END_RE=/[.?!:;"”’)\]]\d{0,3}$/;

/* text items -> lines */
function pageLines(pg){
  var its=pg.items.filter(function(t){ return t.str && t.str.trim(); }).map(function(t){
    var tr=t.transform, sz=Math.hypot(tr[2],tr[3])||t.height||10;
    return {s:t.str, x:tr[4], y:tr[5], w:t.width||0, sz:sz};
  });
  var msz=median(its.map(function(t){return t.sz;}))||10, sups=[];
  its=its.filter(function(t){ if(t.sz<msz*0.8 && /^[\d*†‡]{1,3}$/.test(t.s.trim())){ sups.push(t); return false; } return true; });
  its.sort(function(a,b){ return (b.y-a.y)||(a.x-b.x); });
  var lines=[];
  its.forEach(function(t){
    var L=null;
    for(var i=lines.length-1;i>=0&&i>=lines.length-4;i--){
      var tol=Math.max(2,Math.min(lines[i].sz,t.sz)*0.45);
      if(t.sz<lines[i].sz*0.8 && /^[\d*†‡,\s]{1,4}$/.test(t.s)) tol=lines[i].sz*0.75;
      if(Math.abs(lines[i].y-t.y)<tol){ L=lines[i]; break; } }
    if(!L){ L={y:t.y,sz:t.sz,parts:[]}; lines.push(L); }
    L.parts.push(t); if(t.sz>L.sz && !/^[\d*†‡,\s]{1,4}$/.test(t.s)) L.sz=t.sz;
  });
  sups.forEach(function(t){
    var best=null, bd=1e9;
    lines.forEach(function(L){ var d=t.y-L.y; if(d>=-1 && d<L.sz*0.8 && d<bd){ bd=d; best=L; } });
    if(best){ t.sup=true; best.parts.push(t); }
  });
  return lines.map(function(L){
    L.parts.sort(function(a,b){return a.x-b.x;});
    var txt='', end=null, x0=L.parts[0].x, chars=0, szSum=0;
    L.parts.forEach(function(p){
      if(end!==null){
        var gap=p.x-end;
        if(!p.sup && gap>p.sz*0.12 && !/\s$/.test(txt) && !/^\s/.test(p.s)) txt+=' ';
      }
      txt+=p.s; end=p.x+p.w;
      if(!(p.s.length<=3 && /^[\d*†‡]+$/.test(p.s.trim()) && L.parts.length>1)){ chars+=p.s.length; szSum+=p.sz*p.s.length; }
    });
    return {t:txt.replace(/\s+/g,' ').trim(), x0:x0, x1:end, y:L.y, sz:chars?szSum/chars:L.sz};
  }).filter(function(l){ return l.t; });
}
function normKey(s){ return s.toLowerCase().replace(/\d+/g,'#').replace(/\s+/g,' ').trim(); }

/* pages -> blocks {k:'p'|'h'|'fn', p, en} */
export function buildBlocks(pages){
  var plines=pages.map(function(pg){ return pageLines(pg); });
  // printed page numbers from running heads / feet
  var offs={}, labels=[];
  plines.forEach(function(ls,pi){
    var seen={};
    ls.slice(0,3).concat(ls.slice(-3)).forEach(function(l){
      var m=/^(\d{1,4})$/.exec(l.t)||/^(\d{1,4})\s+\S/.exec(l.t)||/\S\s+(\d{1,4})$/.exec(l.t);
      if(m){ var o=+m[1]-(pi+1); if(!seen[o]){ seen[o]=1; offs[o]=(offs[o]||0)+1; } }
    });
  });
  var bestO=null, bestC=0; Object.keys(offs).forEach(function(o){ if(offs[o]>bestC){ bestC=offs[o]; bestO=+o; } });
  if(bestO!==null && bestC>=Math.max(2,Math.ceil(pages.length*0.4))) pages.forEach(function(pg,pi){ labels[pi]=pi+1+bestO>0?pi+1+bestO:null; });
  plines=plines.map(function(ls,pi){ var hit=ls.filter(function(l){return COVER_RE.test(l.t);}).length; return (pi<2&&hit>=1&&pages.length>2)?[]:ls; });
  // running heads/feet: lines near top/bottom repeated across pages
  var cnt={};
  plines.forEach(function(ls){
    var seen={};
    ls.slice(0,3).concat(ls.slice(-3)).forEach(function(l){ var k=normKey(l.t); if(k.length<90&&!seen[k]){ seen[k]=1; cnt[k]=(cnt[k]||0)+1; } });
  });
  var rep=Math.max(3,Math.ceil(pages.length*0.3));
  var allSz=[], allGap=[];
  plines.forEach(function(ls,pi){
    var w=pages[pi].w;
    plines[pi]=ls.filter(function(l,i){
      if(JUNK_RE.test(l.t)) return false;
      var edge=i<3||i>=ls.length-3;
      if(edge && pages.length>=4 && cnt[normKey(l.t)]>=rep) return false;
      if(edge && /^(page\s*)?[\divxlc]{1,5}$/i.test(l.t)) return false;
      return true;
    });
    // two-column ordering
    var left=plines[pi].filter(function(l){return l.x1<=w*0.56;}), right=plines[pi].filter(function(l){return l.x0>=w*0.44;});
    if(left.length>=8 && right.length>=8){
      var span=plines[pi].filter(function(l){ return left.indexOf(l)<0 && right.indexOf(l)<0; });
      var topY=Math.max.apply(null,left.concat(right).map(function(l){return l.y;}));
      var head=span.filter(function(l){return l.y>topY;}), tail=span.filter(function(l){return l.y<=topY;});
      plines[pi]=head.concat(left,right,tail);
    }
    plines[pi].forEach(function(l,i,arr){
      for(var c=0;c<l.t.length;c+=20) allSz.push(l.sz);
      if(i>0){ var g=arr[i-1].y-l.y; if(g>0 && Math.abs(arr[i-1].sz-l.sz)<1) allGap.push(g); }
    });
  });
  var bodySz=median(allSz)||10, gap=median(allGap)||bodySz*1.3;
  var blocks=[];
  plines.forEach(function(ls,pi){
    var w=pages[pi].w, pg=pi+1;
    var bodyLines=ls.filter(function(l){ return Math.abs(l.sz-bodySz)<bodySz*0.12; });
    var margin=pct(bodyLines.map(function(l){return l.x0;}),0.2)||0;
    var right=pct(bodyLines.map(function(l){return l.x1;}),0.8)||w;
    var cur=null, prev=null, fnY=null;
    function flush(){ if(cur&&cur.en.trim()) blocks.push(cur); cur=null; }
    ls.forEach(function(l){
      var kind = l.sz>bodySz*1.18 && l.t.length<160 ? 'h' : (l.sz<bodySz*0.86 ? 'fn' : 'p');
      var mid=(margin+right)/2, cx=(l.x0+l.x1)/2;
      if(kind==='p' && l.t.length<90 && (l.x0-margin)>bodySz*2.5 && Math.abs(cx-mid)<bodySz*3 && !/[.,;]$/.test(l.t) && (!prev || prev.y-l.y>gap*1.3 || prev.x1<right-bodySz*4)) kind='h';
      if(kind==='fn' && cur && cur.k==='p' && prev && !END_RE.test(prev.t) && fnY===null) kind='p';
      if(kind==='fn' && l.y>pages[pi].h*0.5 && !/^\d/.test(l.t) && !(cur&&cur.k==='fn')) kind='p';
      var numbered=/^\d{1,3}\.?\s+[A-Z“"]/.test(l.t);
      if(fnY===null && numbered && l.y<pages[pi].h*0.45 && prev && END_RE.test(prev.t) && ((prev.y-l.y)>gap*1.25 || l.sz<bodySz*0.95)) kind='fn';
      if(fnY===null && kind==='fn' && l.y<pages[pi].h*0.45) fnY=l.y;
      if(fnY!==null && l.y<=fnY+1) kind='fn';
      var newPara=false;
      if(!cur || cur.k!==kind) newPara=true;
      else if(prev){
        var g=prev.y-l.y;
        if(g>gap*1.55 || g<-gap) newPara=true;
        else if(kind!=='h' && l.x0>margin+bodySz*0.9 && l.x0<w*0.5 && (prev.x0<=margin+bodySz*0.5)) newPara=true;
        else if(kind!=='h' && prev.x1<right-bodySz*4 && END_RE.test(prev.t)) newPara=true;
        if(kind==='fn' && /^\d{1,3}[.\s]/.test(l.t) && END_RE.test(prev.t)) newPara=true;
        if(kind==='fn' && prev.sz && Math.abs(prev.y-l.y)>gap*3) newPara=true;
      }
      if(newPara){ flush(); cur={k:kind,p:pg,en:l.t}; }
      else cur.en=joinLine(cur.en,l.t);
      prev=l;
    });
    flush();
  });
  var its=finishBlocks(blocks);
  if(labels.length) its.forEach(function(it){ if(it.k==='pg'&&labels[it.p-1]) it.lab=labels[it.p-1]; });
  return its;
}
export function isSep(t){ t=String(t||'').trim(); return !!t && t.length<=24 && /^[\s*•·⁂∗~—–\-_.#◆◇❖§]+$/.test(t); }
function joinLine(a,b){
  if(/[A-Za-z]-$/.test(a) && /^[a-z]/.test(b)) return a.slice(0,-1)+b;
  if(/[　-鿿]$/.test(a) && /^[　-鿿]/.test(b)) return a+b;
  return a+' '+b;
}
/* merge across pages, split very long blocks, add page markers */
export function finishBlocks(blocks){
  var out=[];
  blocks.forEach(function(b){
    b.en=b.en.replace(/ﬁ/g,'fi').replace(/ﬂ/g,'fl').replace(/ﬀ/g,'ff').replace(/ﬃ/g,'ffi').replace(/\s+/g,' ').trim();
    if(isSep(b.en)){ if(out.length && out[out.length-1].k!=='sep') out.push({k:'sep',p:b.p,en:'* * *'}); return; }
    if(!b.en || b.en.length<2) return;
    var last=null; for(var i=out.length-1;i>=0;i--){ if(out[i].k===b.k){ last=out[i]; break; } if(out[i].k==='p') break; }
    if(b.k==='p' && last && last.k==='p' && last.p<b.p && !END_RE.test(last.en) && /^[a-z(“"']/.test(b.en)){
      last.en=joinLine(last.en,b.en); return;
    }
    if(b.k==='h' && out.length && out[out.length-1].k==='h' && out[out.length-1].p===b.p && (out[out.length-1].en.length+b.en.length)<200){
      out[out.length-1].en+=' '+b.en; return;
    }
    out.push(b);
  });
  var split=[];
  out.forEach(function(b){
    var t=b.en;
    while(t.length>2400){
      var cut=-1, re=/[.?!]["”’)]?\s+(?=[A-Z“"(])/g, m;
      while((m=re.exec(t))){ if(m.index>1500 && m.index<2300){ cut=m.index+m[0].length; break; } if(m.index>=2300) break; }
      if(cut<0) break;
      split.push({k:b.k,p:b.p,en:t.slice(0,cut).trim()}); t=t.slice(cut);
    }
    split.push({k:b.k,p:b.p,en:t.trim()});
  });
  var inRefs=false;
  split.forEach(function(b){
    if(!inRefs && b.k==='p' && b.en.length<40 && b.en.split(' ').length<=5 && /^[A-Z]/.test(b.en) && !/[.?!,;:]$/.test(b.en)) b.k='h';
    var rm=/^(References|Works Cited|Bibliography|Literature Cited)\s+(\S.*)$/.exec(b.en);
    if(rm && b.k!=='p'){ b.en=rm[1]; b.rest=rm[2]; }
    if(REFS_RE.test(b.en.trim())){ b.k='h'; inRefs=true; return; }
    if(inRefs) b.k='ref';
  });
  var items=[], lastPg=0;
  split=split.reduce(function(a,b){ a.push(b); if(b.rest){ a.push({k:'ref',p:b.p,en:b.rest}); delete b.rest; } return a; },[]);
  split.forEach(function(b){
    if(b.p>lastPg){ items.push({k:'pg',p:b.p,en:'',zh:''}); lastPg=b.p; }
    items.push({k:b.k,p:b.p,en:b.en,zh:''});
  });
  return items;
}

export function extractPdf(file,onProg){
  return loadPdfJs().then(function(pdfjs){
    return file.arrayBuffer().then(function(buf){
      return pdfjs.getDocument({data:new Uint8Array(buf),isEvalSupported:false}).promise;
    }).then(function(pdf){
      var pages=[], meta={title:'',author:''}, n=pdf.numPages;
      var chain=pdf.getMetadata().then(function(m){ var i=(m&&m.info)||{}; meta.title=String(i.Title||''); meta.author=String(i.Author||''); }).catch(noop);
      for(var i=1;i<=n;i++){ (function(i){
        chain=chain.then(function(){ return pdf.getPage(i); }).then(function(pg){
          var vp=pg.getViewport({scale:1});
          return pg.getTextContent().then(function(tc){ pages.push({w:vp.width,h:vp.height,items:tc.items}); pg.cleanup(); if(onProg) onProg(i,n); });
        });
      })(i); }
      return chain.then(function(){ return {pdf:pdf,pages:pages,meta:meta}; });
    });
  });
}

/* scanned PDFs: ask Claude to read page images */
function renderPageBlob(pdf,i){
  return pdf.getPage(i).then(function(pg){
    var vp0=pg.getViewport({scale:1}), sc=Math.min(2.2,1500/vp0.width), vp=pg.getViewport({scale:sc});
    var cv=document.createElement('canvas'); cv.width=Math.round(vp.width); cv.height=Math.round(vp.height);
    return pg.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise.then(function(){
      return new Promise(function(res){ cv.toBlob(function(b){ pg.cleanup(); res(b); },'image/jpeg',0.85); });
    });
  });
}
export function ocrPdf(id,pdf,s,job){
  return s.limits().catch(function(){return null;}).then(function(lim){
    if(!lim||!lim.images) throw {code:'images_unavailable',message:'no images'};
    var per=Math.max(1,Math.min(3,lim.images.maxCount||1)), n=pdf.numPages, blocks=[], start=1;
    function step(){
      if(start>n) return Promise.resolve();
      if(job.stop) throw {code:'cancelled'};
      var pgs=[]; for(var i=start;i<start+per&&i<=n;i++) pgs.push(i);
      start+=per;
      setStat(id,{status:'ocr',ocr:pgs[0]+'/'+n});
      return Promise.all(pgs.map(function(i){return renderPageBlob(pdf,i);})).then(function(imgs){
        var ctl=new AbortController(); job.ctls.push(ctl);
        var prompt='The attached images are pages '+pgs.join(', ')+' (in this order) of a scanned academic text. Transcribe the main text exactly, in reading order.\n'+
          'Rules: skip running headers, page numbers, library stamps and download notices (e.g. "This content downloaded from ..."). Join words hyphenated across line ends. Merge lines into whole paragraphs. A paragraph that continues from the previous page starts a new block (it will be merged later). Mark section headings as "h" and footnotes as "fn".\n'+
          'Output one JSON object per line, exactly {"p": <page number>, "k": "p" | "h" | "fn", "t": "<text>"}, no other text, no code fences.';
        return s(prompt,{images:imgs,signal:ctl.signal,cache:false}).then(function(r){
          jsonLines(r.text).forEach(function(o){
            if(o && typeof o.t==='string' && o.t.trim()){
              var p=Number(o.p); if(pgs.indexOf(p)<0) p=pgs[0];
              blocks.push({k:(o.k==='h'||o.k==='fn')?o.k:'p',p:p,en:o.t.trim()});
            }
          });
        });
      }).then(step);
    }
    return step().then(function(){ return finishBlocks(blocks); });
  });
}
export function jsonLines(text){
  var out=[];
  String(text||'').replace(/```[a-z]*\n?/gi,'').replace(/\}\s*\{/g,'}\n{').split('\n').forEach(function(l){
    l=l.trim().replace(/,$/,''); if(!l||l[0]!=='{') return;
    try{ out.push(JSON.parse(l)); }catch(e){}
  });
  if(!out.length){ try{ var a=JSON.parse(text); if(Array.isArray(a)) out=a; }catch(e){} }
  return out;
}
