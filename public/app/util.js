// Tiny shared helpers: storage keys, element builders, escaping.

var K='ptl:';
export var MAC=/Mac|iPhone|iPad|iPod/.test(navigator.platform||navigator.userAgent);
var SVGNS='http://www.w3.org/2000/svg';
export function icon(n){var v=document.createElementNS(SVGNS,'svg');v.setAttribute('class','ic');v.setAttribute('aria-hidden','true');
  var u=document.createElementNS(SVGNS,'use');u.setAttribute('href','#i-'+n);v.appendChild(u);return v;}
export function lsGet(k,d){try{var v=localStorage.getItem(K+k);return v===null?d:v;}catch(e){return d;}}
export function lsSet(k,v){try{localStorage.setItem(K+k,v);}catch(e){}}
export function el(t,c,x){var n=document.createElement(t);if(c)n.className=c;if(x!=null)n.textContent=x;return n;}
export function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(m){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];});}

export function noop(){}
