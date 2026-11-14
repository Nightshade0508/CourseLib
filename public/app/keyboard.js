// Global keyboard shortcuts.
import './palette.js';
import { db } from './state.js';
import { mroot } from './modal.js';
import { closeTypo, typoBox } from './typography.js';
import { inFocus, setFocus } from './focus.js';
import { newMenu, showShortcuts } from './side-menus.js';
import { closeCmdk, cmdk, openCmdk } from './palette.js';

function typingIn(t){ return t&&(t.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); }
document.addEventListener('keydown',function(e){
  if((e.metaKey||e.ctrlKey)&&!e.altKey&&!e.shiftKey&&(e.key==='k'||e.key==='K')){ e.preventDefault(); if(cmdk) closeCmdk(); else openCmdk(); return; }
  if(cmdk||e.metaKey||e.ctrlKey||e.altKey||typingIn(e.target)||!mroot.hidden||document.querySelector('.mroot:not(#modal)')) return;
  if(e.key==='Escape'){ if(!typoBox.hidden) closeTypo(); else if(inFocus()) setFocus(false); return; }
  if(e.key==='/'){ e.preventDefault(); openCmdk(); }
  else if(e.key==='f'||e.key==='F'){ e.preventDefault(); setFocus(!inFocus()); }
  else if(e.key==='?'){ e.preventDefault(); showShortcuts(); }
  else if((e.key==='n'||e.key==='N')&&db){
    e.preventDefault();
    newMenu();
  }
});
