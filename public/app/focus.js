// Focus mode.
import './learn.js';
import { toast } from './citations.js';
import { closeTypo, keepPlace } from './typography.js';

export function inFocus(){ return document.body.classList.contains('focus'); }
export function setFocus(on){
  if(on===inFocus()) return;
  keepPlace(function(){ document.body.classList.toggle('focus',on); });
  if(on){ closeTypo(); toast('专注模式 · 按 F 或 Esc 退出'); }
}
