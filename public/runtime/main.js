// Runtime entry: window.claude.use('sample' | 'db' | 'downloads') and window.PTL.
import './prices.js';
import { acct, acctLabel, refreshBalance } from './ai-account.js';
import { finishOpenRouterLogin } from './openrouter.js';
import { sample } from './sample.js';
import { db } from './db.js';
import { exportAll, importAll } from './backup.js';
import { downloads } from './downloads.js';
import { openAccount, renderChip } from './ai-account-ui.js';
import { mtPrepare, mtStatus, mtTranslate } from './mt.js';
import { dictLookup } from './dict.js';
import { estimate } from './prices.js';

window.claude={use:function(name){
  if(name==='sample') return Promise.resolve(sample);
  if(name==='db') return Promise.resolve(db);
  if(name==='downloads') return Promise.resolve(downloads);
  return Promise.reject({code:'unsupported',message:'capability not available: '+name});
}};
window.PTL={
  account:function(){ return acct?{provider:acct.provider,label:acctLabel(acct),model:acct.model,quickModel:acct.quickModel||acct.model}:null; },
  openAccount:openAccount,
  estimate:estimate,
  mt:{status:mtStatus,prepare:mtPrepare,translate:mtTranslate},
  dict:dictLookup,
  exportAll:exportAll,
  importAll:importAll
};
function boot(){ renderChip(); finishOpenRouterLogin(); if(acct) refreshBalance(); }
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
