// Opening and closing the sidebar.
import './theme.js';
import { lsGet, lsSet } from './util.js';

var shell=document.getElementById('shell'), scrim=document.getElementById('scrim'), toolbar=document.getElementById('toolbar');
var mq=window.matchMedia('(max-width:900px)');
export function setSide(open){
  var t=document.getElementById('sidetoggle');
  if(mq.matches){
    shell.classList.toggle('drawer-open',open); scrim.hidden=!open;
    document.body.style.overflow=open?'hidden':'';
  }else{
    shell.classList.toggle('side-closed',!open); shell.classList.remove('drawer-open'); scrim.hidden=true;
    document.body.style.overflow='';
    lsSet('side',open?'1':'0');
  }
  t.setAttribute('aria-expanded',open?'true':'false');
}
function sideOpen(){ return mq.matches ? shell.classList.contains('drawer-open') : !shell.classList.contains('side-closed'); }
document.getElementById('sidetoggle').addEventListener('click',function(){ setSide(!sideOpen()); });
document.getElementById('sideclose').addEventListener('click',function(){ setSide(false); });
scrim.addEventListener('click',function(){ setSide(false); });
document.addEventListener('keydown',function(e){ if(e.key==='Escape' && mq.matches && sideOpen()) setSide(false); });
(mq.addEventListener?mq.addEventListener('change',function(){ setSide(mq.matches?false:lsGet('side','1')==='1'); }):null);
setSide(mq.matches?false:lsGet('side','1')==='1');
window.addEventListener('scroll',function(){ toolbar.classList.toggle('scrolled',window.scrollY>160); },{passive:true});
