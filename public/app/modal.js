// Form dialogs.
import './show.js';
import { el } from './util.js';
import { closePop } from './menu.js';

export var mroot=document.getElementById('modal');
export function closeModal(){
  if(mroot.hidden) return;
  var t=mroot._tok=(mroot._tok||0)+1;
  if(window.matchMedia('(prefers-reduced-motion:reduce)').matches){ mroot.hidden=true; mroot.innerHTML=''; return; }
  mroot.classList.add('closing');
  setTimeout(function(){ if(mroot._tok!==t) return; mroot.classList.remove('closing'); mroot.hidden=true; mroot.innerHTML=''; },180);
}
mroot.addEventListener('click',function(e){ if(e.target===mroot) closeModal(); });
document.addEventListener('keydown',function(e){ if(e.key==='Escape'){closeModal();closePop();} });

export function modal(title, fields, onSubmit, submitLabel){
  mroot._tok=(mroot._tok||0)+1; mroot.classList.remove('closing');
  mroot.innerHTML='';
  var box=el('div','mbox');
  var form=el('form','mform');
  form.appendChild(el('h3','mtitle',title));
  var refs={};
  fields.forEach(function(f){
    var wrap=el('div','field');
    var lab=el('label','flabel',f.label); lab.htmlFor='f-'+f.name; wrap.appendChild(lab);
    var input;
    if(f.type==='textarea'){ input=el('textarea','finput'); input.rows=f.rows||9; }
    else if(f.type==='select'){
      input=el('select','finput');
      f.options.forEach(function(o){ var op=el('option','',o.label); op.value=o.value; input.appendChild(op); });
    }
    else if(f.type==='checkbox'){
      wrap.className='field checkfield';
      input=document.createElement('input'); input.type='checkbox'; input.className='fcheck';
      wrap.innerHTML=''; wrap.appendChild(input);
      var l2=el('label','flabel-inline',f.label); l2.htmlFor='f-'+f.name; wrap.appendChild(l2);
    }
    else if(f.type==='file'){
      input=document.createElement('input'); input.type='file'; input.className='finput';
      input.accept=f.accept||'.txt,.md,.markdown,.html,.htm,text/plain,text/markdown,text/html';
    }
    else { input=document.createElement('input'); input.type='text'; input.className='finput'; }
    input.id='f-'+f.name;
    if(f.value!=null && f.type!=='checkbox' && f.type!=='file') input.value=f.value;
    if(f.type==='checkbox' && f.value) input.checked=true;
    if(f.placeholder) input.placeholder=f.placeholder;
    if(f.hint){ var hint=el('p','fhint',f.hint); wrap.appendChild(input); wrap.appendChild(hint); }
    else wrap.appendChild(input);
    refs[f.name]=input;
    form.appendChild(wrap);
    if(f.after) f.after(input,refs,form);
  });
  var err=el('p','ferr',''); err.hidden=true; form.appendChild(err);
  var row=el('div','mrow');
  var cancel=el('button','btn ghost','取消'); cancel.type='button';
  cancel.addEventListener('click',closeModal);
  var ok=el('button','btn primary',submitLabel||'保存'); ok.type='submit';
  row.appendChild(cancel); row.appendChild(ok); form.appendChild(row);
  form.addEventListener('submit',function(e){
    e.preventDefault();
    var vals={};
    Object.keys(refs).forEach(function(k){
      vals[k]= refs[k].type==='checkbox' ? refs[k].checked : refs[k].value;
    });
    Promise.resolve(onSubmit(vals,refs)).then(function(r){
      if(r&&r.error){ err.textContent=r.error; err.hidden=false; }
      else closeModal();
    }).catch(function(ex){
      err.textContent='保存失败：'+((ex&&ex.message)||'请稍后再试'); err.hidden=false;
    });
  });
  box.appendChild(form); mroot.appendChild(box); mroot.hidden=false;
  var first=form.querySelector('.finput'); if(first) first.focus();
}
