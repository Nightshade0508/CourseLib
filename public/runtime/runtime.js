/* Parallel Text Library — standalone runtime.
   The page was first written as a claude.ai Artifact and talks to its host through
   window.claude.use('sample' | 'db' | 'downloads'). This file provides the same three
   capabilities on an ordinary website:
     sample    → the visitor's own AI account (OpenRouter login, Anthropic API key, or any
                 OpenAI-compatible endpoint); usage is billed to that account
     db        → a small document store in IndexedDB (this browser only), with live snapshots
     downloads → a plain browser download
   Keys never leave the browser except to the AI provider the visitor chose. */
(function(){
  'use strict';
  var ACCT_KEY='ptl-account', USAGE_KEY='ptl-usage', PKCE_KEY='ptl-or-verifier';
  var OR='https://openrouter.ai/api/v1';
  var SDK_URL=new URL('vendor/anthropic-sdk.mjs',document.baseURI).href;
  function noop(){}
  function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function lsSet(k,v){ try{ if(v==null) localStorage.removeItem(k); else localStorage.setItem(k,v); }catch(e){} }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(m){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]; }); }
  function clone(o){ return o==null?o:(typeof structuredClone==='function'?structuredClone(o):JSON.parse(JSON.stringify(o))); }

  /* ================= account ================= */
  var PROVIDERS={
    openrouter:{name:'OpenRouter',model:'anthropic/claude-opus-5.5',quick:'anthropic/claude-haiku-5.5'},
    anthropic:{name:'Anthropic API',model:'claude-opus-5-5',quick:'claude-haiku-5-5'},
    openai:{name:'OpenAI 兼容服务',model:'',quick:''}
  };
  var acct=null;
  try{ acct=JSON.parse(lsGet(ACCT_KEY)||'null'); }catch(e){}
  function setAccount(a){
    acct=a; lsSet(ACCT_KEY,a?JSON.stringify(a):null); balance=null;
    renderChip(); window.dispatchEvent(new CustomEvent('ptl:account'));
    if(a) refreshBalance();
  }
  function acctLabel(a){
    if(!a) return '';
    if(a.provider==='openai') return (a.name||hostOf(a.baseUrl)||'OpenAI 兼容服务');
    return PROVIDERS[a.provider].name;
  }
  function hostOf(u){ try{ return new URL(u).host; }catch(e){ return ''; } }

  var usage={};
  try{ usage=JSON.parse(lsGet(USAGE_KEY)||'{}')||{}; }catch(e){}
  function addUsage(inp,out){
    if(!acct) return;
    var k=acct.provider, u=usage[k]||(usage[k]={in:0,out:0});
    u.in+=inp||0; u.out+=out||0; lsSet(USAGE_KEY,JSON.stringify(usage)); renderChip();
  }

  var balance=null; // OpenRouter only: {remaining: number|null, usage: number}
  function refreshBalance(){
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

  /* ---- OpenRouter OAuth (PKCE): the visitor signs in on openrouter.ai and we receive a key billed to them ---- */
  function b64url(bytes){ var s=''; for(var i=0;i<bytes.length;i++) s+=String.fromCharCode(bytes[i]); return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
  function callbackUrl(){ return location.origin+location.pathname; }
  function startOpenRouterLogin(){
    var v=b64url(crypto.getRandomValues(new Uint8Array(48)));
    try{ sessionStorage.setItem(PKCE_KEY,v); }catch(e){}
    return crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)).then(function(h){
      location.href='https://openrouter.ai/auth?callback_url='+encodeURIComponent(callbackUrl())+'&code_challenge='+b64url(new Uint8Array(h))+'&code_challenge_method=S256';
    });
  }
  function finishOpenRouterLogin(){
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
  var orModels=null, orPrice={}; // id -> [input, output] USD per million tokens
  function loadOpenRouterModels(){
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

  /* ================= sample: call the visitor's AI account ================= */
  function blobToB64(b){
    return new Promise(function(res,rej){ var r=new FileReader(); r.onload=function(){ res(String(r.result).split(',')[1]); }; r.onerror=rej; r.readAsDataURL(b); });
  }
  function images(opts){
    return Promise.all((opts.images||[]).map(function(b){
      return blobToB64(b).then(function(d){ return {type:(b.type||'image/png'),data:d}; });
    }));
  }
  function modelFor(opts){ return opts.modelTier==='quick'?(acct.quickModel||acct.model):acct.model; }

  var sdkP=null;
  function loadSdk(){ if(!sdkP){ sdkP=import(SDK_URL).then(function(m){ return m.default||m.Anthropic; }); sdkP.catch(function(){ sdkP=null; }); } return sdkP; }
  // models that accept the server-side refusal fallback
  var FALLBACK_RE=/^claude-(fable-5-1|opus-5|sonnet-5-5)/;
  function runAnthropic(prompt,opts,imgs){
    return loadSdk().then(function(Anthropic){
      var client=new Anthropic({apiKey:acct.key,dangerouslyAllowBrowser:true});
      var model=modelFor(opts), quick=opts.modelTier==='quick';
      var content=imgs.map(function(i){ return {type:'image',source:{type:'base64',media_type:i.type,data:i.data}}; });
      content.push({type:'text',text:prompt});
      var params={model:model,max_tokens:quick?8000:64000,messages:[{role:'user',content:content}]};
      if(quick) params.output_config={effort:'low'};
      var ro=opts.signal?{signal:opts.signal}:undefined, stream;
      if(FALLBACK_RE.test(model)){
        params.betas=['server-side-fallback-2026-07-01']; params.fallbacks='default';
        stream=client.beta.messages.stream(params,ro);
      } else stream=client.messages.stream(params,ro);
      if(opts.onText) stream.on('text',function(delta,snapshot){ opts.onText({text:snapshot,delta:delta}); });
      return stream.finalMessage().then(function(msg){
        if(msg.usage) addUsage(msg.usage.input_tokens,msg.usage.output_tokens);
        if(msg.stop_reason==='refusal') throw {code:'refused'};
        return {text:msg.content.filter(function(b){ return b.type==='text'; }).map(function(b){ return b.text; }).join('')};
      }).catch(function(e){ throw anthropicErr(Anthropic,e,opts); });
    });
  }
  function anthropicErr(A,e,opts){
    if(e&&e.code) return e;
    if((opts.signal&&opts.signal.aborted)||(A.APIUserAbortError&&e instanceof A.APIUserAbortError)) return {code:'cancelled'};
    if(e instanceof A.AuthenticationError||e instanceof A.PermissionDeniedError) return {code:'not_granted',message:e.message};
    if(e instanceof A.RateLimitError) return {code:'rate_limited',message:e.message};
    if(e instanceof A.APIConnectionError) return {code:'network',message:'无法连接 Anthropic：'+e.message};
    if(e instanceof A.APIError){
      if(e.status===402||e.type==='billing_error'||/credit balance/i.test(e.message||'')) return {code:'no_credits',message:e.message};
      if(e.status===413||/prompt is too long|too many tokens/i.test(e.message||'')) return {code:'prompt_too_large',message:e.message};
      return {code:'api_error',message:e.message};
    }
    return {code:'error',message:(e&&e.message)||String(e)};
  }

  // OpenRouter and other OpenAI-compatible endpoints: streamed chat completions
  function runChat(prompt,opts,imgs){
    var base=acct.provider==='openrouter'?OR:String(acct.baseUrl||'').replace(/\/+$/,'');
    var quick=opts.modelTier==='quick';
    var content=imgs.length?[{type:'text',text:prompt}].concat(imgs.map(function(i){ return {type:'image_url',image_url:{url:'data:'+i.type+';base64,'+i.data}}; })):prompt;
    var body={model:modelFor(opts),messages:[{role:'user',content:content}],stream:true,max_tokens:quick?8000:32000};
    if(acct.provider==='openrouter') body.usage={include:true};
    else body.stream_options={include_usage:true};
    var headers={'Content-Type':'application/json',Authorization:'Bearer '+acct.key};
    if(acct.provider==='openrouter'){ headers['HTTP-Referer']=location.origin; headers['X-Title']='Parallel Text Library'; }
    return fetch(base+'/chat/completions',{method:'POST',headers:headers,body:JSON.stringify(body),signal:opts.signal}).then(function(r){
      if(!r.ok) return r.text().then(function(t){ var m=t; try{ var j=JSON.parse(t); m=(j.error&&(j.error.message||j.error))||t; }catch(_){} throw httpErr(r.status,String(m)); });
      var reader=r.body.getReader(), dec=new TextDecoder(), buf='', text='', finish='';
      function line(l){
        if(l.indexOf('data:')!==0) return;
        var d=l.slice(5).trim(); if(!d||d==='[DONE]') return;
        var j; try{ j=JSON.parse(d); }catch(_){ return; }
        if(j.error) throw httpErr(j.error.code||500,j.error.message||'stream error');
        var c=j.choices&&j.choices[0];
        if(c&&c.delta&&c.delta.content){ text+=c.delta.content; if(opts.onText) opts.onText({text:text,delta:c.delta.content}); }
        if(c&&c.finish_reason) finish=c.finish_reason;
        if(j.usage) addUsage(j.usage.prompt_tokens,j.usage.completion_tokens);
      }
      return (function pump(){
        return reader.read().then(function(x){
          if(x.done){ if(buf) line(buf); return; }
          buf+=dec.decode(x.value,{stream:true});
          var parts=buf.split('\n'); buf=parts.pop();
          parts.forEach(function(p){ line(p.replace(/\r$/,'')); });
          return pump();
        });
      })().then(function(){
        if(finish==='content_filter'&&!text) throw {code:'refused'};
        if(acct.provider==='openrouter') setTimeout(refreshBalance,1500);
        return {text:text};
      });
    }).catch(function(e){
      if(e&&e.code) throw e;
      if((opts.signal&&opts.signal.aborted)||(e&&e.name==='AbortError')) throw {code:'cancelled'};
      throw {code:'network',message:'无法连接 AI 服务：'+((e&&e.message)||e)};
    });
  }
  function httpErr(status,msg){
    if(status===401||status===403) return {code:'not_granted',message:msg};
    if(status===402) return {code:'no_credits',message:msg};
    if(status===429) return {code:'rate_limited',message:msg};
    if(status===413||/context length|too long|maximum context/i.test(msg)) return {code:'prompt_too_large',message:msg};
    return {code:'api_error',message:msg};
  }

  function sample(prompt,opts){
    opts=opts||{};
    if(!acct){ openAccount(); return Promise.reject({code:'not_signed_in',message:'请先登录 AI 账号'}); }
    return images(opts).then(function(imgs){
      return acct.provider==='anthropic'?runAnthropic(prompt,opts,imgs):runChat(prompt,opts,imgs);
    });
  }
  sample.json=function(prompt,opts){
    return sample(prompt,opts).then(function(r){ return parseJson(r.text); });
  };
  sample.limits=function(){ return Promise.resolve({images:{maxCount:3}}); };
  function parseJson(t){
    t=String(t||'').replace(/^\s*```(?:json)?\s*/i,'').replace(/\s*```\s*$/,'');
    try{ return JSON.parse(t); }catch(_){}
    var a=t.search(/[\[{]/), b=Math.max(t.lastIndexOf('}'),t.lastIndexOf(']'));
    if(a>=0&&b>a){ try{ return JSON.parse(t.slice(a,b+1)); }catch(_){} }
    throw {code:'invalid_json',message:'返回的不是有效 JSON'};
  }

  /* ================= db: documents in IndexedDB, Firestore-like paths ================= */
  // A document path has an even number of segments ("docs/abc", "pdf/abc/chunks/c0001");
  // its collection is everything before the last segment.
  function split(path){ var i=path.lastIndexOf('/'); return {col:path.slice(0,i),id:path.slice(i+1)}; }
  var idbP=null, mem=null;
  function idb(){
    if(idbP) return idbP;
    idbP=new Promise(function(res){
      var req;
      try{ req=indexedDB.open('parallel-text-library',1); }catch(e){ mem={}; return res(null); }
      req.onupgradeneeded=function(){ var s=req.result.createObjectStore('docs',{keyPath:'path'}); s.createIndex('col','col'); };
      req.onsuccess=function(){ res(req.result); };
      req.onerror=function(){ mem={}; res(null); };
    });
    return idbP;
  }
  function tx(mode,fn){
    return idb().then(function(d){
      if(!d) return fn(null);
      return new Promise(function(res,rej){
        var t=d.transaction('docs',mode), st=t.objectStore('docs'), out;
        Promise.resolve(fn(st)).then(function(v){ out=v; });
        t.oncomplete=function(){ res(out); }; t.onerror=function(){ rej(t.error); }; t.onabort=function(){ rej(t.error); };
      });
    });
  }
  function reqP(r){ return new Promise(function(res,rej){ r.onsuccess=function(){ res(r.result); }; r.onerror=function(){ rej(r.error); }; }); }
  function getRec(path){ return tx('readonly',function(st){ return st?reqP(st.get(path)):mem[path]; }); }
  function putRec(rec){ return tx('readwrite',function(st){ if(st) st.put(rec); else mem[rec.path]=rec; }); }
  function delRec(path){ return tx('readwrite',function(st){ if(st) st.delete(path); else delete mem[path]; }); }
  function listCol(col){
    return tx('readonly',function(st){
      if(!st) return Object.keys(mem).map(function(k){ return mem[k]; }).filter(function(r){ return r.col===col; });
      return reqP(st.index('col').getAll(col));
    });
  }

  var subs={}; // col -> [listener]
  var bc=null; try{ bc=new BroadcastChannel('ptl-db'); bc.onmessage=function(e){ if(e.data&&e.data.reload) location.reload(); else if(e.data&&e.data.col) fire(e.data.col,false); }; }catch(e){}
  function fire(col,broadcast){
    (subs[col]||[]).slice().forEach(function(l){ l.refresh(); });
    if(broadcast&&bc) try{ bc.postMessage({col:col}); }catch(e){}
  }
  function docSnap(id,data){ return {id:id,exists:data!==undefined,data:function(){ return clone(data); }}; }
  function colSnap(recs,changes){
    var docs=recs.map(function(r){ return docSnap(r.id,r.data); });
    return {docs:docs,size:docs.length,empty:!docs.length,forEach:function(f){ docs.forEach(f); },docChanges:function(){ return changes; }};
  }
  function docRef(path){
    var p=split(path);
    return {
      id:p.id, path:path,
      get:function(){ return getRec(path).then(function(r){ return docSnap(p.id,r?r.data:undefined); }); },
      set:function(data){ return putRec({path:path,col:p.col,id:p.id,data:clone(data)}).then(function(){ fire(p.col,true); }); },
      update:function(data){
        return getRec(path).then(function(r){
          if(!r) throw {code:'not_found',message:'No document to update: '+path};
          var d=r.data||{}; Object.keys(data).forEach(function(k){ d[k]=clone(data[k]); });
          return putRec({path:path,col:p.col,id:p.id,data:d});
        }).then(function(){ fire(p.col,true); });
      },
      delete:function(){ return delRec(path).then(function(){ fire(p.col,true); }); }
    };
  }
  function colRef(col){
    return {
      doc:function(id){ return docRef(col+'/'+id); },
      get:function(){ return listCol(col).then(function(recs){ return colSnap(recs,recs.map(function(r){ return {type:'added',doc:docSnap(r.id,r.data)}; })); }); },
      onSnapshot:function(cb,onErr){
        var last={}, alive=true, busy=null, again=false;
        var l={refresh:function(){
          if(busy){ again=true; return; }
          busy=listCol(col).then(function(recs){
            if(!alive) return;
            var now={}, changes=[];
            recs.forEach(function(r){
              var s=JSON.stringify(r.data); now[r.id]=s;
              if(!(r.id in last)) changes.push({type:'added',doc:docSnap(r.id,r.data)});
              else if(last[r.id]!==s) changes.push({type:'modified',doc:docSnap(r.id,r.data)});
            });
            Object.keys(last).forEach(function(id){ if(!(id in now)) changes.push({type:'removed',doc:docSnap(id,undefined)}); });
            var first=!l.seen; l.seen=true; last=now;
            if(first||changes.length) cb(colSnap(recs,changes));
          }).catch(function(e){ if(onErr) onErr(e); }).then(function(){ busy=null; if(again){ again=false; l.refresh(); } });
        }};
        (subs[col]||(subs[col]=[])).push(l);
        l.refresh();
        return function(){ alive=false; subs[col]=(subs[col]||[]).filter(function(x){ return x!==l; }); };
      }
    };
  }
  var db={doc:docRef,collection:colRef};

  /* ---- backup: every db record plus the page's own localStorage keys ("ptl:…").
     The AI account (keys) is deliberately left out. ---- */
  var LOCAL_PREFIX='ptl:';
  function allRecs(){
    return tx('readonly',function(st){ return st?reqP(st.getAll()):Object.keys(mem).map(function(k){ return mem[k]; }); });
  }
  function exportAll(){
    return allRecs().then(function(recs){
      var local={};
      try{ for(var i=0;i<localStorage.length;i++){ var k=localStorage.key(i); if(k&&k.indexOf(LOCAL_PREFIX)===0) local[k]=localStorage.getItem(k); } }catch(e){}
      return {app:'parallel-text-library',version:1,exportedAt:new Date().toISOString(),
        db:recs.map(function(r){ return {path:r.path,data:r.data}; }),local:local};
    });
  }
  function importAll(b,mode){
    if(!b||b.app!=='parallel-text-library'||!Array.isArray(b.db)) return Promise.reject({code:'bad_backup',message:'这不是 Parallel Text Library 的备份文件。'});
    var recs=b.db.filter(function(r){ return r&&typeof r.path==='string'&&r.path.indexOf('/')>0; }).map(function(r){ var p=split(r.path); return {path:r.path,col:p.col,id:p.id,data:r.data}; });
    return tx('readwrite',function(st){
      if(!st){ if(mode==='replace') mem={}; recs.forEach(function(r){ mem[r.path]=r; }); return; }
      if(mode==='replace') st.clear();
      recs.forEach(function(r){ st.put(r); });
    }).then(function(){
      try{
        if(mode==='replace'){ var del=[]; for(var i=0;i<localStorage.length;i++){ var k=localStorage.key(i); if(k&&k.indexOf(LOCAL_PREFIX)===0) del.push(k); } del.forEach(function(k){ localStorage.removeItem(k); }); }
        Object.keys(b.local||{}).forEach(function(k){ if(k.indexOf(LOCAL_PREFIX)===0) localStorage.setItem(k,b.local[k]); });
      }catch(e){}
      if(bc) try{ bc.postMessage({reload:true}); }catch(e){}
      return {records:recs.length};
    });
  }
  if(navigator.storage&&navigator.storage.persist) navigator.storage.persist().catch(noop);

  /* ================= downloads ================= */
  var downloads={save:function(o){
    var blob=o.data instanceof Blob?o.data:new Blob([o.data],{type:o.mimeType||'application/octet-stream'});
    var a=document.createElement('a'), url=URL.createObjectURL(blob);
    a.href=url; a.download=o.filename||'download'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); },4000);
    return Promise.resolve({status:'saved'});
  }};

  window.claude={use:function(name){
    if(name==='sample') return Promise.resolve(sample);
    if(name==='db') return Promise.resolve(db);
    if(name==='downloads') return Promise.resolve(downloads);
    return Promise.reject({code:'unsupported',message:'capability not available: '+name});
  }};

  /* ================= account UI ================= */
  var css=document.createElement('style');
  css.textContent=
    '#acct{padding:0 2px}'+
    '.acct-chip{width:100%;display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--rule);border-radius:12px;background:var(--surface);cursor:pointer;text-align:left;font-family:var(--f-ui);color:var(--ink-2);transition:border-color .15s,background .15s}'+
    '.acct-chip:hover{border-color:var(--ink-2);color:var(--ink)}'+
    '.acct-dot{width:8px;height:8px;border-radius:50%;flex:none;background:var(--muted)}.acct-chip.on .acct-dot{background:#3d8b5a}'+
    '.acct-t{display:flex;flex-direction:column;min-width:0;flex:1}.acct-t b{font-size:13px;font-weight:600;color:var(--ink)}'+
    '.acct-t span{font-size:11.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'+
    '.acct-opts{display:flex;flex-direction:column;gap:12px}'+
    '.acct-opt{border:1px solid var(--rule);border-radius:12px;padding:16px 18px;display:flex;flex-direction:column;gap:10px;font-family:var(--f-ui)}'+
    '.acct-opt h3{margin:0;font-size:14px;font-weight:600;color:var(--ink);display:flex;align-items:center;gap:8px}'+
    '.acct-opt p{margin:0;font-size:12.5px;line-height:1.6;color:var(--ink-2)}'+
    '.acct-opt a{color:var(--ink);text-underline-offset:.2em}'+
    '.acct-tag{font-size:10.5px;font-weight:500;padding:2px 8px;border-radius:999px;background:var(--accent-soft);color:var(--accent)}'+
    '.acct-row{display:flex;gap:8px;flex-wrap:wrap}.acct-row .finput{flex:1;min-width:180px}'+
    '.acct-stat{display:grid;grid-template-columns:auto 1fr;gap:6px 16px;font-family:var(--f-ui);font-size:13px;padding:14px 16px;border-radius:12px;background:var(--panel);border:1px solid var(--rule-soft)}'+
    '.acct-stat dt{color:var(--muted)}.acct-stat dd{margin:0;color:var(--ink);overflow-wrap:anywhere}'+
    '.acct-stat a{color:var(--ink);text-underline-offset:.2em}'+
    'details.acct-more summary{cursor:pointer;font-family:var(--f-ui);font-size:12.5px;color:var(--ink-2)}'+
    'details.acct-more[open] summary{margin-bottom:10px}';
  document.head.appendChild(css);

  function fmtTok(n){ return n>=1e6?(n/1e6).toFixed(2)+'M':n>=1e3?(n/1e3).toFixed(1)+'k':String(n||0); }
  function renderChip(){
    var box=document.getElementById('acct'); if(!box) return;
    var sub;
    if(!acct) sub='未登录 · 登录后可翻译、查词';
    else if(acct.provider==='openrouter'&&balance&&balance.remaining!=null) sub=acctLabel(acct)+' · 余额 $'+balance.remaining.toFixed(2);
    else { var u=usage[acct.provider]; sub=acctLabel(acct)+(u?' · 本机已用 '+fmtTok(u.in+u.out)+' tokens':' · 已登录'); }
    box.innerHTML='<button type="button" class="acct-chip'+(acct?' on':'')+'"><span class="acct-dot"></span><span class="acct-t"><b>AI 账号</b><span>'+esc(sub)+'</span></span></button>';
    box.firstChild.addEventListener('click',openAccount);
  }

  var dlg=null;
  function openAccount(){
    if(dlg){ renderDialog(); return; }
    dlg=document.createElement('div'); dlg.className='mroot'; dlg.setAttribute('role','dialog'); dlg.setAttribute('aria-modal','true'); dlg.setAttribute('aria-label','AI 账号');
    dlg.addEventListener('click',function(e){ if(e.target===dlg) closeAccount(); });
    document.addEventListener('keydown',escClose);
    document.body.appendChild(dlg);
    renderDialog();
    if(acct&&acct.provider==='openrouter'){ refreshBalance(); loadOpenRouterModels().then(function(){ if(dlg) renderDialog(); }); }
  }
  function escClose(e){ if(e.key==='Escape') closeAccount(); }
  function closeAccount(){
    if(!dlg) return; var d=dlg; dlg=null; document.removeEventListener('keydown',escClose);
    d.classList.add('closing'); setTimeout(function(){ d.remove(); },180);
  }
  function renderDialog(){
    if(!dlg) return;
    var h='<div class="mbox"><div class="mform"><h2 class="mtitle">AI 账号</h2>';
    if(acct){
      var u=usage[acct.provider]||{in:0,out:0};
      h+='<dl class="acct-stat"><dt>服务</dt><dd>'+esc(acctLabel(acct))+'</dd>'+
        (acct.provider==='openrouter'?'<dt>余额</dt><dd>'+(balance&&balance.remaining!=null?'$'+balance.remaining.toFixed(2)+' · <a href="https://openrouter.ai/settings/credits" target="_blank" rel="noopener">充值 ↗</a>':'查询中…')+'</dd>':'')+
        (acct.provider==='anthropic'?'<dt>计费</dt><dd>从你的 Anthropic 账户扣费 · <a href="https://console.anthropic.com/settings/billing" target="_blank" rel="noopener">查看用量 ↗</a></dd>':'')+
        '<dt>本机用量</dt><dd>输入 '+fmtTok(u.in)+' · 输出 '+fmtTok(u.out)+' tokens</dd></dl>'+
        '<label class="field"><span class="flabel">主模型（翻译、解释、学习卡片）</span><input class="finput" id="ptl-m" list="ptl-ml" value="'+esc(acct.model)+'"></label>'+
        '<label class="field"><span class="flabel">快速模型（查词、命名、引用格式）</span><input class="finput" id="ptl-q" list="ptl-ml" value="'+esc(acct.quickModel||'')+'"></label>'+
        '<datalist id="ptl-ml"></datalist>'+
        '<p class="fhint">密钥只保存在这台设备的浏览器里，请求直接发给 '+esc(acctLabel(acct))+'，不经过本站服务器。</p>'+
        '<p class="ferr" id="ptl-err" hidden></p>'+
        '<div class="mrow"><button type="button" class="btn ghost" data-a="logout">退出登录</button><button type="button" class="btn ghost" data-a="close">取消</button><button type="button" class="btn primary" data-a="save">保存</button></div>';
    } else {
      h+='<p class="fhint">翻译、查词、学习卡片等功能会调用 AI 模型，费用从你自己的账号扣除。选一种方式登录：</p><div class="acct-opts">'+
        '<div class="acct-opt"><h3>OpenRouter 账号 <span class="acct-tag">推荐</span></h3><p>一键登录，按实际用量从你的 OpenRouter 余额扣费；可用 Claude、GPT、Gemini、DeepSeek 等模型。没有账号会引导你注册。</p>'+
          '<div class="acct-row"><button type="button" class="btn primary" data-a="or">用 OpenRouter 登录</button></div></div>'+
        '<div class="acct-opt"><h3>Anthropic API Key</h3><p>直接使用 Claude，从你的 Anthropic 账户扣费。在 <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">Anthropic Console ↗</a> 创建密钥。</p>'+
          '<div class="acct-row"><input class="finput" id="ptl-ak" type="password" placeholder="sk-ant-…" autocomplete="off"><button type="button" class="btn primary" data-a="ak">连接</button></div></div>'+
        '<details class="acct-more acct-opt"><summary>其他 OpenAI 兼容服务（DeepSeek、Kimi、通义千问等）</summary>'+
          '<div class="acct-opts"><input class="finput" id="ptl-ob" placeholder="接口地址，例如 https://api.deepseek.com/v1">'+
          '<input class="finput" id="ptl-ok" type="password" placeholder="API Key" autocomplete="off">'+
          '<input class="finput" id="ptl-om" placeholder="模型名，例如 deepseek-chat">'+
          '<div class="acct-row"><button type="button" class="btn primary" data-a="oa">连接</button></div></div></details>'+
        '</div><p class="fhint">密钥只保存在这台设备的浏览器里，请求直接发给你选的 AI 服务，不经过本站服务器。</p>'+
        '<p class="ferr" id="ptl-err" hidden></p>'+
        '<div class="mrow"><button type="button" class="btn ghost" data-a="close">关闭</button></div>';
    }
    h+='</div></div>';
    dlg.innerHTML=h;
    if(acct&&acct.provider==='openrouter') loadOpenRouterModels().then(function(ids){
      var dl=dlg&&dlg.querySelector('#ptl-ml'); if(dl) dl.innerHTML=ids.map(function(id){ return '<option value="'+esc(id)+'">'; }).join('');
    });
    [].slice.call(dlg.querySelectorAll('[data-a]')).forEach(function(b){ b.addEventListener('click',function(){ act(b.dataset.a,b); }); });
    var first=dlg.querySelector('#ptl-ak,#ptl-m'); if(first&&!acct) first.focus();
  }
  function showErr(m){ var e=dlg&&dlg.querySelector('#ptl-err'); if(e){ e.textContent=m; e.hidden=!m; } }
  function val(id){ var e=dlg.querySelector('#'+id); return e?e.value.trim():''; }
  function act(a,btn){
    if(a==='close') return closeAccount();
    if(a==='or'){ btn.disabled=true; return startOpenRouterLogin(); }
    if(a==='logout'){ setAccount(null); return renderDialog(); }
    if(a==='save'){
      var m=val('ptl-m'); if(!m) return showErr('请填写主模型。');
      acct.model=m; acct.quickModel=val('ptl-q')||m; setAccount(acct); closeAccount(); return toast('已保存');
    }
    if(a==='ak'){
      var key=val('ptl-ak'); if(!/^sk-ant-/.test(key)) return showErr('Anthropic API Key 以 sk-ant- 开头。');
      btn.disabled=true; showErr('');
      return loadSdk().then(function(Anthropic){
        return new Anthropic({apiKey:key,dangerouslyAllowBrowser:true}).models.retrieve(PROVIDERS.anthropic.model);
      }).then(function(){
        setAccount({provider:'anthropic',key:key,model:PROVIDERS.anthropic.model,quickModel:PROVIDERS.anthropic.quick});
        closeAccount(); toast('已连接 Anthropic');
      }).catch(function(e){ btn.disabled=false; showErr('连接失败：'+((e&&e.message)||e)); });
    }
    if(a==='oa'){
      var base=val('ptl-ob').replace(/\/+$/,''), k=val('ptl-ok'), mo=val('ptl-om');
      if(!/^https:\/\//.test(base)) return showErr('接口地址需要以 https:// 开头。');
      if(!k||!mo) return showErr('请填写 API Key 和模型名。');
      setAccount({provider:'openai',baseUrl:base,key:k,model:mo,quickModel:mo,name:hostOf(base)});
      closeAccount(); return toast('已连接 '+hostOf(base));
    }
  }

  function toast(m){
    var t=document.createElement('div'); t.className='toast'; t.textContent=m; document.body.appendChild(t);
    setTimeout(function(){ t.classList.add('out'); setTimeout(function(){ t.remove(); },220); },2600);
  }

  /* ---- cost estimate: Anthropic list prices, OpenRouter's own price list, unknown elsewhere ---- */
  var PRICES={ // USD per million tokens [input, output]
    'claude-fable-5-1':[10,50],'claude-fable-5':[10,50],'claude-opus-5-5':[4,20],'claude-opus-5':[5,25],
    'claude-opus-4-8':[5,25],'claude-opus-4-7':[5,25],'claude-opus-4-6':[5,25],
    'claude-sonnet-5-5':[2,10],'claude-sonnet-5':[2,10],'claude-sonnet-4-6':[3,15],
    'claude-haiku-5-5':[0.1,0.5],'claude-haiku-4-5':[1,5]
  };
  function estimate(o){
    if(!acct) return Promise.resolve(null);
    var quick=o.tier==='quick', model=modelFor({modelTier:o.tier});
    return (acct.provider==='openrouter'?loadOpenRouterModels():Promise.resolve()).then(function(){
      var p=acct.provider==='anthropic'?PRICES[model]:acct.provider==='openrouter'?orPrice[model]:null;
      // non-quick calls leave room for the model's own reasoning tokens
      var out=o.outTokens*(quick?1:1.3);
      return {model:model,tokens:Math.round(o.inTokens+out),usd:p?(o.inTokens*p[0]+out*p[1])/1e6:null,sameModel:(acct.quickModel||acct.model)===acct.model};
    });
  }

  window.PTL={
    account:function(){ return acct?{provider:acct.provider,label:acctLabel(acct),model:acct.model,quickModel:acct.quickModel||acct.model}:null; },
    openAccount:openAccount,
    estimate:estimate,
    exportAll:exportAll,
    importAll:importAll
  };
  function boot(){ renderChip(); finishOpenRouterLogin(); if(acct) refreshBalance(); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
