// The visitor's AI account: provider, key and models, kept in this browser only.
import './util.js';
import { ACCT_KEY, OR, USAGE_KEY, lsGet, lsSet, noop } from './util.js';
import { dlg, renderChip, renderDialog } from './ai-account-ui.js';

export var PROVIDERS={
  openrouter:{name:'OpenRouter',model:'anthropic/claude-opus-5.5',quick:'anthropic/claude-haiku-5.5'},
  anthropic:{name:'Anthropic API',model:'claude-opus-5-5',quick:'claude-haiku-5-5'},
  openai:{name:'OpenAI 兼容服务',model:'',quick:''}
};
export var acct=null;
try{ acct=JSON.parse(lsGet(ACCT_KEY)||'null'); }catch(e){}
export function setAccount(a){
  acct=a; lsSet(ACCT_KEY,a?JSON.stringify(a):null); balance=null;
  renderChip(); window.dispatchEvent(new CustomEvent('ptl:account'));
  if(a) refreshBalance();
}
export function acctLabel(a){
  if(!a) return '';
  if(a.provider==='openai') return (a.name||hostOf(a.baseUrl)||'OpenAI 兼容服务');
  return PROVIDERS[a.provider].name;
}
export function hostOf(u){ try{ return new URL(u).host; }catch(e){ return ''; } }

export var usage={};
try{ usage=JSON.parse(lsGet(USAGE_KEY)||'{}')||{}; }catch(e){}
export function addUsage(inp,out){
  if(!acct) return;
  var k=acct.provider, u=usage[k]||(usage[k]={in:0,out:0});
  u.in+=inp||0; u.out+=out||0; lsSet(USAGE_KEY,JSON.stringify(usage)); renderChip();
}

export var balance=null; // OpenRouter only: {remaining: number|null, usage: number}
export function refreshBalance(){
  if(!acct||acct.provider!=='openrouter') return Promise.resolve();
  var h={Authorization:'Bearer '+acct.key};
  return fetch(OR+'/credits',{headers:h}).then(function(r){ if(!r.ok) throw r; return r.json(); }).then(function(j){
    var d=j.data||{}; balance={remaining:(d.total_credits||0)-(d.total_usage||0),usage:d.total_usage||0};
  }).catch(function(){
    return fetch(OR+'/key',{headers:h}).then(function(r){ return r.ok?r.json():null; }).then(function(j){
      if(j&&j.data) balance={remaining:j.data.limit_remaining!=null?j.data.limit_remaining:null,usage:j.data.usage||0};
    }).catch(noop);
  }).then(function(){ renderChip(); if(dlg) renderDialog(); });
}
