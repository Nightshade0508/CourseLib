// downloads: save a file from the page.
import './backup.js';

export var downloads={save:function(o){
  var blob=o.data instanceof Blob?o.data:new Blob([o.data],{type:o.mimeType||'application/octet-stream'});
  var a=document.createElement('a'), url=URL.createObjectURL(blob);
  a.href=url; a.download=o.filename||'download'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(url); },4000);
  return Promise.resolve({status:'saved'});
}};
