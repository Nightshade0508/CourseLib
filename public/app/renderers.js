// Turn stored document bodies (paired text, Markdown, HTML) into reading markup.
import './lang.js';
import { esc } from './util.js';

function isCJK(ch){
  if(!ch) return false;
  var c=ch.charCodeAt(0);
  return (c>=0x2e80&&c<=0x9fff)||(c>=0xff00&&c<=0xffef)||'《》「」『』（）〔〕【】“”‘’，。；：？！、·'.indexOf(ch)>=0;
}
function blocks(txt){
  return txt.replace(/\r/g,'').split(/\n\s*\n+/).map(function(b){return b.trim();}).filter(Boolean);
}
function renderPaired(txt){
  var bs=blocks(txt), out=[], i=0;
  while(i<bs.length){
    var a=bs[i], zh='';
    if(!isCJK(a[0])){
      if(i+1<bs.length && isCJK(bs[i+1][0])){ zh=bs[i+1]; i++; }
      out.push('<div class="pair"><p class="en">'+esc(a).replace(/\n/g,' ')+'</p>'+
               (zh?'<p class="zh">'+esc(zh).replace(/\n/g,' ')+'</p>':'')+'</div>');
    }else{
      out.push('<div class="pair"><p class="zh">'+esc(a).replace(/\n/g,' ')+'</p></div>');
    }
    i++;
  }
  return out.join('');
}
function renderPlain(txt){
  return blocks(txt).map(function(b){
    var cls=isCJK(b[0])?'zh':'en';
    return '<div class="pair"><p class="'+cls+'">'+esc(b).replace(/\n/g,'<br>')+'</p></div>';
  }).join('');
}
function inline(s){
  return esc(s)
    .replace(/`([^`]+)`/g,'<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>')
    .replace(/(^|[^*])\*([^*]+)\*/g,'$1<i>$2</i>');
}
function renderMd(txt){
  var out=[], list=null;
  blocks(txt).forEach(function(b){
    var lines=b.split('\n');
    if(/^#{1,3}\s/.test(lines[0]) && lines.length===1){
      var lv=lines[0].match(/^#+/)[0].length;
      out.push('<h'+(lv+1)+'>'+inline(lines[0].replace(/^#+\s*/,''))+'</h'+(lv+1)+'>');
      return;
    }
    if(/^[-*]\s/.test(lines[0])){
      out.push('<ul>'+lines.map(function(l){return '<li>'+inline(l.replace(/^[-*]\s*/,''))+'</li>';}).join('')+'</ul>');
      return;
    }
    if(/^>\s?/.test(lines[0])){
      out.push('<div class="pair quote"><p class="'+(isCJK(b.replace(/^>\s?/,'')[0])?'zh':'en')+'">'+
               inline(lines.map(function(l){return l.replace(/^>\s?/,'');}).join(' '))+'</p></div>');
      return;
    }
    var cls=isCJK(b[0])?'zh':'en';
    out.push('<div class="pair"><p class="'+cls+'">'+inline(b).replace(/\n/g,' ')+'</p></div>');
  });
  return out.join('');
}
var OKTAG=/^(P|DIV|SPAN|B|STRONG|I|EM|U|BR|HR|H1|H2|H3|H4|H5|H6|UL|OL|LI|BLOCKQUOTE|TABLE|THEAD|TBODY|TR|TD|TH|CODE|PRE|SUP|SUB|A|FIGURE|FIGCAPTION|SMALL|SECTION|ARTICLE)$/;
function sanitize(html){
  var d=document.createElement('div'); d.innerHTML=html;
  (function walk(node){
    [].slice.call(node.children).forEach(function(c){
      if(!OKTAG.test(c.tagName)){ c.remove(); return; }
      [].slice.call(c.attributes).forEach(function(a){
        var n=a.name.toLowerCase();
        if(n.slice(0,2)==='on'){ c.removeAttribute(a.name); return; }
        if(n==='href'){ if(/^\s*javascript:/i.test(a.value)) c.removeAttribute('href'); return; }
        if(n!=='class'&&n!=='colspan'&&n!=='rowspan') c.removeAttribute(a.name);
      });
      walk(c);
    });
  })(d);
  return d.innerHTML;
}
export function renderDocBody(d){
  if(d.format==='html') return sanitize(d.body||'');
  if(d.format==='md') return renderMd(d.body||'');
  return d.paired ? renderPaired(d.body||'') : renderPlain(d.body||'');
}
