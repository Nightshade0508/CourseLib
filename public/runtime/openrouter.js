// OpenRouter sign-in (OAuth PKCE), balance and model list.
import './ai-account.js';
import { OR, PKCE_KEY } from './util.js';
import { PROVIDERS, acct, setAccount } from './ai-account.js';
import { toast } from './ai-account-ui.js';

function b64url(bytes){ var s=''; for(var i=0;i<bytes.length;i++) s+=String.fromCharCode(bytes[i]); return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function callbackUrl(){ return location.origin+location.pathname; }
export function startOpenRouterLogin(){
  var v=b64url(crypto.getRandomValues(new Uint8Array(48)));
  try{ sessionStorage.setItem(PKCE_KEY,v); }catch(e){}
  return crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)).then(function(h){
    location.href='https://openrouter.ai/auth?callback_url='+encodeURIComponent(callbackUrl())+'&code_challenge='+b64url(new Uint8Array(h))+'&code_challenge_method=S256';
  });
}
export function finishOpenRouterLogin(){
  var q=new URLSearchParams(location.search), code=q.get('code'), v=null;
  try{ v=sessionStorage.getItem(PKCE_KEY); }catch(e){}
  if(!code||!v) return;
  try{ sessionStorage.removeItem(PKCE_KEY); }catch(e){}
  q.delete('code'); history.replaceState(null,'',location.pathname+(q.toString()?'?'+q:'')+location.hash);
  fetch(OR+'/auth/keys',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:code,code_verifier:v,code_challenge_method:'S256'})})
    .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
    .then(function(j){
      if(!j.key) throw new Error('no key');
      var a={provider:'openrouter',key:j.key,model:PROVIDERS.openrouter.model,quickModel:PROVIDERS.openrouter.quick};
      setAccount(a);
      return pickOpenRouterModels(a).then(function(){ toast('已登录 OpenRouter'); });
    })
    .catch(function(e){ toast('OpenRouter 登录失败：'+(e&&e.message||e)); });
}
export var orModels=null, orPrice={}; // id -> [input, output] USD per million tokens
export function loadOpenRouterModels(){
  if(!orModels) orModels=fetch(OR+'/models').then(function(r){ return r.json(); }).then(function(j){
    return (j.data||[]).map(function(m){
      var p=m.pricing||{}; if(p.prompt!=null&&p.completion!=null) orPrice[m.id]=[parseFloat(p.prompt)*1e6,parseFloat(p.completion)*1e6];
      return m.id;
    });
  }).catch(function(){ orModels=null; return []; });
  return orModels;
}
function newest(ids,re){
  var hit=ids.filter(function(id){ return re.test(id); });
  hit.sort(function(a,b){ return b.localeCompare(a,undefined,{numeric:true}); });
  return hit[0]||null;
}
// choose the newest Claude Opus / Haiku slugs OpenRouter currently lists
function pickOpenRouterModels(a){
  return loadOpenRouterModels().then(function(ids){
    if(!ids.length||!acct||acct!==a) return;
    var m=newest(ids,/^anthropic\/claude-opus-[\d.]+$/), q=newest(ids,/^anthropic\/claude-haiku-[\d.]+$/);
    if(m) a.model=m; if(q) a.quickModel=q;
    setAccount(a);
  });
}
