// Runtime entry: window.claude.use('sample' | 'db' | 'downloads') and window.PTL.
import './user-ui.js';
import { acct, acctLabel, refreshBalance } from './ai-account.js';
import { finishOpenRouterLogin } from './openrouter.js';
import { sample } from './sample.js';
import { db, user } from './db.js';
import { exportAll, importAll } from './backup.js';
import { downloads } from './downloads.js';
import { openAccount, renderChip } from './ai-account-ui.js';
import { mtPrepare, mtStatus, mtTranslate } from './mt.js';
import { dictLookup } from './dict.js';
import { estimate } from './prices.js';
import { cloudOn } from './cloud.js';
import { syncNow, syncState } from './sync.js';
import { openAccountDialog, openSignIn, startAccounts, syncText } from './user-ui.js';

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
  importAll:importAll,
  // site accounts and cloud sync (off unless public/config.js configures them)
  accounts:cloudOn,
  user:function(){ return user?{uid:user.uid,email:user.email,name:user.name}:null; },
  openUser:function(){ if(user) openAccountDialog(); else openSignIn(); },
  sync:{now:syncNow,state:function(){ return syncState; },text:syncText}
};
function boot(){ renderChip(); startAccounts(); finishOpenRouterLogin(); if(acct) refreshBalance(); }
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
