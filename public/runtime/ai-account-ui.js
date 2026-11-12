// The AI account dialog and the chip in the sidebar.
import './downloads.js';
import { esc } from './util.js';
import {
  PROVIDERS, acct, acctLabel, balance, hostOf, refreshBalance, setAccount, usage,
} from './ai-account.js';
import { loadOpenRouterModels, startOpenRouterLogin } from './openrouter.js';
import { loadSdk } from './sample.js';

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
export function renderChip(){
  var box=document.getElementById('acct'); if(!box) return;
  var sub;
  if(!acct) sub='未登录 · 可直接用免费翻译';
  else if(acct.provider==='openrouter'&&balance&&balance.remaining!=null) sub=acctLabel(acct)+' · 余额 $'+balance.remaining.toFixed(2);
  else { var u=usage[acct.provider]; sub=acctLabel(acct)+(u?' · 本机已用 '+fmtTok(u.in+u.out)+' tokens':' · 已登录'); }
  box.innerHTML='<button type="button" class="acct-chip'+(acct?' on':'')+'"><span class="acct-dot"></span><span class="acct-t"><b>AI 账号</b><span>'+esc(sub)+'</span></span></button>';
  box.firstChild.addEventListener('click',openAccount);
}

export var dlg=null;
export function openAccount(){
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
export function renderDialog(){
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
    h+='<p class="fhint">免费翻译和查词不需要登录。登录后，翻译、查词、段落解释和学习卡片会用更强的 AI 模型，费用从你自己的账号扣除。选一种方式登录：</p><div class="acct-opts">'+
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

export function toast(m){
  var t=document.createElement('div'); t.className='toast'; t.textContent=m; document.body.appendChild(t);
  setTimeout(function(){ t.classList.add('out'); setTimeout(function(){ t.remove(); },220); },2600);
}
