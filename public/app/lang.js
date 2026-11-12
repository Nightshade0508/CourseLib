// The 对照 / EN / 中 / 学 switch.
import './sidebar.js';
import { lsGet, lsSet } from './util.js';
import { LEARN, learnRefresh } from './learn.js';

export var segs=[].slice.call(document.querySelectorAll('#langseg button'));
function lang(m){
  document.body.classList.remove('only-en','only-zh','zh-blur');
  if(m==='blur')document.body.classList.add('zh-blur');
  if(m==='en')document.body.classList.add('only-en');
  if(m==='zh')document.body.classList.add('only-zh');
  segs.forEach(function(b){
    var on=b.dataset.lang===m;
    b.classList.toggle('on',on); b.setAttribute('aria-pressed',on?'true':'false');
  });
  lsSet('lang',m);
  if(typeof learnRefresh==='function'&&LEARN) learnRefresh();
}
segs.forEach(function(b){b.addEventListener('click',function(){lang(b.dataset.lang);});});
lang(lsGet('lang','both'));
