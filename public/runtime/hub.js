// One dialog for everything about "you": the site account (sign in, sync) and the AI service, as two tabs,
// and the single chip in the sidebar that opens it. ai-account-ui.js and user-ui.js render into its panels.
import './downloads.js';
import { esc } from './util.js';

var root=null, nav=null, tabs=[], active=null;
// defineTab(id, label, {order, open(): render the tab's default content, visible(): is it offered, closed(): forget the panel})
export function defineTab(id,label,o){
  tabs.push({id:id,label:label,order:o.order||0,open:o.open,visible:o.visible||function(){ return true; },closed:o.closed||function(){}});
  tabs.sort(function(a,b){ return a.order-b.order; });
}
export function hubOpen(){ return !!root; }
export function activeTab(){ return root?active:null; }
// The panel a tab renders into; opening it (and the dialog) if needed. Busy panels (panel._busy) keep the dialog open.
export function panel(id){
  if(!root) build();
  var p=root.querySelector('.hub-panel[data-tab="'+id+'"]');
  select(id);
  return p;
}
function build(){
  root=document.createElement('div'); root.className='mroot hub-root';
  root.setAttribute('role','dialog'); root.setAttribute('aria-modal','true'); root.setAttribute('aria-label','账号');
  var shown=tabs.filter(function(t){ return t.visible(); });
  root.innerHTML='<div class="mbox hub"><div class="hub-tabs" role="tablist"'+(shown.length<2?' hidden':'')+'>'+
    shown.map(function(t){ return '<button type="button" role="tab" data-tab="'+esc(t.id)+'">'+esc(t.label)+'</button>'; }).join('')+
    '<span class="hub-ink" aria-hidden="true"></span></div>'+
    tabs.map(function(t){ return '<div class="hub-panel" role="tabpanel" data-tab="'+esc(t.id)+'" hidden></div>'; }).join('')+'</div>';
  nav=root.querySelector('.hub-tabs');
  [].slice.call(nav.querySelectorAll('button')).forEach(function(b){ b.addEventListener('click',function(){ showTab(b.dataset.tab); }); });
  root.addEventListener('mousedown',function(e){ root._down=e.target===root; });
  root.addEventListener('click',function(e){ if(e.target===root&&root._down&&!busy()) closeHub(); });
  document.addEventListener('keydown',escClose);
  document.body.appendChild(root);
}
function busy(){ return !!(root&&root.querySelector('.hub-panel:not([hidden])')&&root.querySelector('.hub-panel:not([hidden])')._busy); }
function escClose(e){ if(e.key==='Escape'&&!busy()) closeHub(); }
function select(id){
  active=id;
  [].slice.call(root.querySelectorAll('.hub-panel')).forEach(function(p){ p.hidden=p.dataset.tab!==id; });
  var on=null;
  [].slice.call(nav.querySelectorAll('button')).forEach(function(b){ var a=b.dataset.tab===id; b.classList.toggle('on',a); b.setAttribute('aria-selected',a?'true':'false'); if(a) on=b; });
  var ink=nav.querySelector('.hub-ink');
  if(on&&ink) requestAnimationFrame(function(){ ink.style.width=on.offsetWidth+'px'; ink.style.transform='translateX('+on.offsetLeft+'px)'; });
}
// switching tabs keeps what each tab shows (and anything typed into it); a tab is drawn the first time it is shown
export function showTab(id){
  if(busy()) return;
  var t=tabs.filter(function(x){ return x.id===id; })[0]; if(!t) return;
  var p=panel(id);
  if(!p.firstChild) t.open();
}
export function openHub(id){
  var shown=tabs.filter(function(t){ return t.visible(); });
  if(!shown.some(function(t){ return t.id===id; })) id=shown[0].id;
  var t=tabs.filter(function(x){ return x.id===id; })[0];
  panel(id); t.open();
}
export function closeHub(){
  if(!root) return;
  var r=root; root=null; nav=null; active=null; document.removeEventListener('keydown',escClose);
  tabs.forEach(function(t){ t.closed(); });
  r.classList.add('closing'); setTimeout(function(){ r.remove(); },180);
}

// the sidebar chip: whoever knows what to show draws it (user-ui.js when accounts are on, else ai-account-ui.js)
var chipFn=null;
export function setChip(fn){ chipFn=fn; }
export function renderChip(){ if(chipFn) chipFn(); }
