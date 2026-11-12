// sample(): call the visitor's AI account (Anthropic SDK or an OpenAI-compatible endpoint).
import './openrouter.js';
import { OR, SDK_URL } from './util.js';
import { acct, addUsage, refreshBalance } from './ai-account.js';
import { openAccount } from './ai-account-ui.js';

function blobToB64(b){
  return new Promise(function(res,rej){ var r=new FileReader(); r.onload=function(){ res(String(r.result).split(',')[1]); }; r.onerror=rej; r.readAsDataURL(b); });
}
function images(opts){
  return Promise.all((opts.images||[]).map(function(b){
    return blobToB64(b).then(function(d){ return {type:(b.type||'image/png'),data:d}; });
  }));
}
export function modelFor(opts){ return opts.modelTier==='quick'?(acct.quickModel||acct.model):acct.model; }

var sdkP=null;
export function loadSdk(){ if(!sdkP){ sdkP=import(SDK_URL).then(function(m){ return m.default||m.Anthropic; }); sdkP.catch(function(){ sdkP=null; }); } return sdkP; }
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

export function sample(prompt,opts){
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
