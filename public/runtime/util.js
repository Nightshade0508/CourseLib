// Shared helpers and constants for the runtime.

export var ACCT_KEY='ptl-account', USAGE_KEY='ptl-usage', PKCE_KEY='ptl-or-verifier';
export var OR='https://openrouter.ai/api/v1';
export var SDK_URL=new URL('vendor/anthropic-sdk.mjs',document.baseURI).href;
export var RUNTIME_BASE=import.meta.url;   // any file in runtime/ works as the base for its siblings
export function noop(){}
export function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
export function lsSet(k,v){ try{ if(v==null) localStorage.removeItem(k); else localStorage.setItem(k,v); }catch(e){} }
export function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(m){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]; }); }
export function clone(o){ return o==null?o:(typeof structuredClone==='function'?structuredClone(o):JSON.parse(JSON.stringify(o))); }
