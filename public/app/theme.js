// Light / dark theme.
import './util.js';
import { lsGet, lsSet } from './util.js';

export var themeBtns=[].slice.call(document.querySelectorAll('#themeseg button'));
function applyTheme(m){
  var r=document.documentElement;
  if(m==='light') r.setAttribute('data-theme','light');
  else if(m==='dark') r.setAttribute('data-theme','dark');
  else r.removeAttribute('data-theme');
  themeBtns.forEach(function(b){
    var on=b.dataset.theme===m;
    b.classList.toggle('on',on); b.setAttribute('aria-pressed',on?'true':'false');
  });
  lsSet('theme',m);
}
themeBtns.forEach(function(b){b.addEventListener('click',function(){applyTheme(b.dataset.theme);});});
applyTheme(lsGet('theme','system'));
