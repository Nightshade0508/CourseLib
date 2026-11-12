// A web article, as returned by the reader service (Markdown), turned into the blocks the library stores:
// headings, paragraphs, reference entries and (optionally) images. Pure functions, no DOM;
// unit-tested in tests/unit/article.test.mjs.

// Escaped Markdown punctuation is parked in private-use characters while the syntax is stripped.
var ESC='[]()*_`~#>!|\\', ESC0=0xE000;
function park(s){ return s.replace(/\\([\[\]()*_`~#>!|\\])/g,function(m,c){ return String.fromCharCode(ESC0+ESC.indexOf(c)); }); }
function unpark(s){ return s.replace(/[-]/g,function(c){ return ESC[c.charCodeAt(0)-ESC0]; }); }

var IMG_RE=/!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
var LINKED_IMG_RE=/\[\s*(!\[[^\]]*\]\([^)]*\))\s*\]\((?:[^()\s]|\([^()]*\))*(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
var LINK_RE=/\[([^\[\]]*)\]\(\s*(?:[^()\s]|\([^()\s]*\))*(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;

// Inline Markdown → plain text: links keep their text, emphasis markers go, citation markers ([1], [edit]) go.
export function plainText(s){
  s=park(String(s||''));
  s=s.replace(LINKED_IMG_RE,'$1').replace(IMG_RE,'');
  for(var i=0;i<4&&LINK_RE.test(s);i++){ LINK_RE.lastIndex=0; s=s.replace(LINK_RE,'$1'); }
  LINK_RE.lastIndex=0;
  s=s.replace(/<(?:https?:\/\/|mailto:)[^>\s]+>/g,'').replace(/<\/?[a-zA-Z][^>]*>/g,' ')
    .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g,'$2')
    .replace(/(^|[^\w*])\*(?=[^\s*])([^*]*?[^\s*])\*(?![\w*])/g,'$1$2')
    .replace(/(^|[^\w_])_(?=[^\s_])([^_]*?[^\s_])_(?![\w_])/g,'$1$2')
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g,'$1')
    .replace(/`+([^`]+)`+/g,'$1');
  s=unpark(s)
    .replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#0?39;|&apos;/g,"'")
    .replace(/\s*\[(?:\d{1,3}|[a-z]|edit|citation needed|note \d+|nb \d+)\]/gi,'');
  return s.replace(/\s+/g,' ').replace(/\s+([,.;:!?])/g,'$1').trim();
}

// Images worth keeping: real web addresses, no vector icons, nothing that names itself a logo or tracking pixel.
export function keepImage(src){
  return /^https?:\/\//i.test(src) && src.length<2000 && !/\.svg(?:[?#]|$)/i.test(src) &&
    !/(?:^|[\/_.=-])(?:logo|icon|sprite|avatar|gravatar|pixel|spacer|badge|emoji|button|loader|loading|placeholder|blank)s?(?:[\/_.?=-]|$)/i.test(src);
}
function absUrl(src,base){ try{ return new URL(src,base||undefined).href; }catch(e){ return ''; } }

// Markdown → blocks {k:'h'|'p'|'img', en, src?, alt?}. A paragraph of '* * *' stands for a section break.
// opts.images: keep images; opts.base: address that relative image paths resolve against.
export function markdownBlocks(md,opts){
  opts=opts||{};
  var out=[], buf=[], seen={}, fence=null, nImg=0;
  function image(alt,src){
    src=absUrl(unpark(src),opts.base);
    if(!opts.images||!keepImage(src)||seen[src]||nImg>=60) return;
    seen[src]=1; nImg++;
    out.push({k:'img',en:'',src:src,alt:plainText(alt).replace(/^Image \d+(?:,\d+)*:?\s*/i,'')});
  }
  function flush(kind){
    if(!buf.length) return;
    var raw=park(buf.join(' ')); buf=[];
    raw=raw.replace(LINKED_IMG_RE,'$1').replace(IMG_RE,function(m,alt,src){ image(alt,src); return ' '; });
    var text=plainText(raw);                       // still parked: plainText puts the escaped characters back
    if(!kind&&/^[↑^]\s*\S/.test(text)){ kind='ref'; text=text.replace(/^[↑^]\s*/,''); }   // a footnote's "back to text" arrow
    if(text.length>=2||/^\d$/.test(text)) out.push({k:kind||'p',en:text});
  }
  String(md||'').replace(/\r\n?/g,'\n').split('\n').forEach(function(line){
    var m;
    if(fence){ if(line.trim().indexOf(fence)===0) fence=null; return; }          // code blocks are not prose
    if((m=/^\s*(```+|~~~+)/.exec(line))){ flush(); fence=m[1].slice(0,3); return; }
    line=line.replace(/^\s*(?:>\s?)+/,'');                                       // quotations read as paragraphs
    if(!line.trim()){ flush(); return; }
    if((m=/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line))){ flush(); buf=[m[2]]; flush('h'); return; }
    if(/^\s{0,3}(?:=+|-{2,})\s*$/.test(line)&&buf.length===1&&!/^\s*(?:[*+-]|\d+[.)])\s/.test(buf[0])){ flush('h'); return; }   // setext heading
    if(/^\s{0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/.test(line)){ flush(); out.push({k:'p',en:'* * *'}); return; }
    if(/^\s*\|?[\s:|-]*-{3,}[\s:|-]*\|?\s*$/.test(line)&&line.indexOf('|')>=0) return;                       // table rule
    if(/^\s*\|.*\|\s*$/.test(line)){ flush(); buf=[line.trim().replace(/^\||\|$/g,'').split('|').map(function(c){ return c.trim(); }).filter(Boolean).join(' — ')]; flush(); return; }
    if((m=/^\s*(?:[*+-]|\d+[.)])\s+(.*)$/.exec(line))){ flush(); buf=[m[1]]; return; }                        // each list item is a paragraph
    buf.push(line.trim());
  });
  flush();
  return out;
}

var REF_HEAD=/^(references|notes|footnotes|endnotes|citations|works cited|bibliography|sources|external links|further reading|see also)\.?$/i;
function clean(s){ return String(s==null?'':s).replace(/\s+/g,' ').trim(); }
function norm(s){ return clean(s).toLowerCase().replace(/[^a-z0-9一-鿿]+/g,' ').trim(); }

// The reader's answer ({title, url, content, metadata, …}) → {title, author, site, url, blocks, chars, images, cjk}.
// Blocks after a closing "References" / "Notes" / "See also" heading are marked k:'ref' (kept, never translated).
export function articleFromReader(data,opts){
  opts=opts||{}; data=data||{};
  var meta=data.metadata||{}, url=clean(data.finalUrl||data.url||opts.url), host='';
  try{ host=new URL(url).hostname.replace(/^www\./,''); }catch(e){}
  var site=clean(meta['og:site_name']||meta['application-name'])||host;
  var title=clean(data.title||meta['og:title']||meta.citation_title);
  var parts=title.split(/\s+[|–—-]\s+/);                       // "Title | Site" → "Title"
  if(parts.length>1){
    var tail=norm(parts[parts.length-1]), s=norm(site), h=norm(host.split('.').slice(-2,-1)[0]||'');
    if(tail&&(tail===s||tail===h||(s&&(s.indexOf(tail)>=0||tail.indexOf(s)>=0)))) title=clean(title.slice(0,title.lastIndexOf(parts[parts.length-1])).replace(/\s+[|–—-]\s*$/,''));
  }
  var au=meta.citation_author||meta.author||meta['article:author']||meta['parsely-author']||meta['dc.creator']||meta['DC.creator']||'';
  var author=(Array.isArray(au)?au:[au]).map(clean).filter(function(a){ return a&&!/^https?:/i.test(a); })
    .map(function(a){ var m=/^([^,]+),\s*([^,]+)$/.exec(a); return m?m[2]+' '+m[1]:a; }).join(', ');
  var blocks=markdownBlocks(data.content,{images:!!opts.images,base:url});
  if(blocks.length&&blocks[0].k==='h'&&norm(blocks[0].en)===norm(title)) blocks.shift();     // the title is shown in the header already
  var first=blocks.filter(function(b){ return b.k==='p'; })[0];
  if(first) first.en=first.en.replace(/^([B-HJ-Z]) (?=[a-z]{2})|^([AI]) (?=[a-z] )/,'$1$2');   // a drop cap split from its word: "T he" → "The"
  var total=0; blocks.forEach(function(b){ total+=b.en.length; });
  var seenChars=0, refs=false;
  blocks.forEach(function(b){
    if(b.k==='h'&&!refs&&seenChars>total*0.5&&REF_HEAD.test(b.en)) refs=true;
    else if(refs&&b.k==='p'&&b.en!=='* * *') b.k='ref';
    else if(refs&&b.k==='img') b.k='';                                     // pictures among the references are not content
    seenChars+=b.en.length;
  });
  blocks=blocks.filter(function(b){ return b.k; });
  var lead=clean(meta['og:image']||meta['twitter:image']);                // no picture in the text → the page's lead image, if any
  lead=lead?absUrl(lead,url):'';
  if(opts.images&&lead&&keepImage(lead)&&!blocks.some(function(b){ return b.k==='img'; })) blocks.unshift({k:'img',en:'',src:lead,alt:title});
  var chars=0, cjk=0, images=0;
  blocks.forEach(function(b){
    if(b.k==='img') images++;
    else if(b.k!=='ref'){ chars+=b.en.length; cjk+=(b.en.match(/[\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af]/g)||[]).length; }
  });
  return {title:title,author:author,site:site,url:url,blocks:blocks,chars:chars,images:images,cjk:chars?cjk/chars:0};
}
