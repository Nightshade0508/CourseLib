// The account chip in the sidebar and its dialogs: sign in, register, status, sign out, delete the account.
import './sync.js';
import { esc, noop } from './util.js';
import { adoptGuest, dropLocal, guestSummary, reloadAllTabs, setLocalUser, user } from './db.js';
import {
  authErr, cloud, cloudOn, deleteAccount, onUser, resendVerification, resetPassword, signIn, signInGoogle,
  signOutCloud, signUp,
} from './cloud.js';
import { onSync, startSync, syncNow, syncState } from './sync.js';
import { setAccount } from './ai-account.js';
import { toast } from './ai-account-ui.js';

var PERSON='<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="3.5"/><path d="M5 19.5c1-3.5 3.8-5 7-5s6 1.5 7 5"/></svg>';
var GOOGLE='<svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.33-1.58-5.04-3.7H.96v2.33A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.96 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3 2.33C4.67 5.16 6.66 3.58 9 3.58z"/></svg>';

function ago(t){
  var s=Math.round((Date.now()-t)/1000);
  return s<45?'刚刚':s<3600?Math.round(s/60)+' 分钟前':s<86400?Math.round(s/3600)+' 小时前':Math.round(s/86400)+' 天前';
}
export function syncText(){
  var s=syncState;
  if(s.phase==='starting') return '正在连接…';
  if(s.phase==='syncing') return '正在同步…';
  if(s.phase==='offline') return '离线 · 联网后自动同步';
  if(s.phase==='error') return '同步遇到问题，稍后自动重试';
  if(s.phase==='expired') return '登录已过期，点这里重新登录';
  if(s.phase==='idle') return (s.pending?'有 '+s.pending+' 项待同步':'已同步'+(s.at?' · '+ago(s.at):''))+(s.tooBig?' · '+s.tooBig+' 项太大未同步':'');
  return '';
}
export function renderUserChip(){
  var box=document.getElementById('user'); if(!box) return;
  if(!cloudOn){ box.innerHTML=''; return; }
  if(!user){
    box.innerHTML='<button type="button" class="acct-chip user-chip"><span class="user-av">'+PERSON+'</span><span class="acct-t"><b>登录 / 注册</b><span>内容自动存到云端，换设备也能看</span></span></button>';
    box.firstChild.addEventListener('click',function(){ openSignIn(); });
    return;
  }
  var name=user.email||user.name||'我的账号';
  box.innerHTML='<button type="button" class="acct-chip user-chip on s-'+esc(syncState.phase)+'"><span class="user-av">'+esc(name.trim().charAt(0).toUpperCase())+'</span><span class="acct-t"><b>'+esc(name)+'</b><span>'+esc(syncText())+'</span></span></button>';
  box.firstChild.addEventListener('click',function(){ if(syncState.phase==='expired') openSignIn(user.email); else openAccountDialog(); });
  // an open account dialog only has its status line refreshed, so nothing being typed is lost
  var line=dlg&&dlg._kind==='account'&&dlg._view==='main'?$('#user-sync'):null; if(line) line.textContent=syncText();
}

// ---- one dialog at a time ----
var dlg=null;
function openDialog(kind,label){
  closeDialog();
  dlg=document.createElement('div'); dlg.className='mroot'; dlg._kind=kind;
  dlg.setAttribute('role','dialog'); dlg.setAttribute('aria-modal','true'); dlg.setAttribute('aria-label',label);
  dlg.addEventListener('mousedown',function(e){ dlg._down=e.target===dlg; });
  dlg.addEventListener('click',function(e){ if(e.target===dlg&&dlg._down&&!dlg._busy) closeDialog(); });
  document.addEventListener('keydown',escClose);
  document.body.appendChild(dlg);
  return dlg;
}
function escClose(e){ if(e.key==='Escape'&&dlg&&!dlg._busy) closeDialog(); }
function closeDialog(){
  if(!dlg) return;
  var d=dlg; dlg=null; document.removeEventListener('keydown',escClose);
  d.classList.add('closing'); setTimeout(function(){ d.remove(); },180);
}
function $(sel){ return dlg?dlg.querySelector(sel):null; }
function say(msg,good){ var e=$('.ferr'); if(e){ e.textContent=msg||''; e.hidden=!msg; e.classList.toggle('good',!!good); } }
function busy(on){ if(!dlg) return; dlg._busy=on; [].slice.call(dlg.querySelectorAll('button,input')).forEach(function(b){ b.disabled=on; }); }

// ---- sign in / register ----
export function openSignIn(email,mode){
  if(!cloudOn) return;
  var d=openDialog('signin','登录');
  d._mode=mode==='up'?'up':'in';
  d.innerHTML='<div class="mbox"><form class="mform user-form" novalidate>'+
    '<h2 class="mtitle"></h2>'+
    '<div class="user-tabs" role="tablist"><button type="button" role="tab" data-mode="in">登录</button><button type="button" role="tab" data-mode="up">注册</button></div>'+
    '<button type="button" class="btn user-google" data-a="google">'+GOOGLE+'<span>用 Google 账号继续</span></button>'+
    '<div class="user-or"><span>或者用邮箱</span></div>'+
    '<label class="field"><span class="flabel">邮箱</span><input class="finput" id="user-email" type="email" autocomplete="email" inputmode="email" value="'+esc(email||'')+'"></label>'+
    '<label class="field"><span class="flabel">密码</span><input class="finput" id="user-pw" type="password"></label>'+
    '<p class="fhint user-hint"></p>'+
    '<p class="ferr" hidden></p>'+
    '<div class="mrow user-row"><button type="button" class="lnk user-forgot" data-a="forgot">忘记密码？</button><span class="user-grow"></span>'+
    '<button type="button" class="btn ghost" data-a="close">取消</button><button type="submit" class="btn primary"></button></div>'+
    '</form></div>';
  function paint(){
    var up=d._mode==='up';
    $('.mtitle').textContent=up?'注册账号':'登录';
    $('button[type=submit]').textContent=up?'注册':'登录';
    $('#user-pw').autocomplete=up?'new-password':'current-password';
    $('.user-forgot').hidden=up;
    $('.user-hint').textContent=(up?'密码至少 6 位，注册后会收到一封验证邮件。':'')+'账号用来保存你的读物、译文、标注、生词和阅读进度；AI 密钥只留在这台设备上，不会上传。';
    [].slice.call(d.querySelectorAll('.user-tabs button')).forEach(function(b){ var on=b.dataset.mode===d._mode; b.classList.toggle('on',on); b.setAttribute('aria-selected',on?'true':'false'); });
    say('');
  }
  [].slice.call(d.querySelectorAll('.user-tabs button')).forEach(function(b){ b.addEventListener('click',function(){ d._mode=b.dataset.mode; paint(); }); });
  $('[data-a=close]').addEventListener('click',closeDialog);
  $('[data-a=google]').addEventListener('click',function(){
    say(''); busy(true);
    signInGoogle().then(afterSignIn,function(e){ busy(false); say(authErr(e)); });
  });
  $('[data-a=forgot]').addEventListener('click',function(){
    var em=$('#user-email').value.trim();
    if(!em){ say('先填上邮箱，再点“忘记密码”。'); $('#user-email').focus(); return; }
    busy(true);
    resetPassword(em).then(function(){ busy(false); say('重置密码的邮件已发到 '+em+'（没收到的话看看垃圾邮件箱）。',true); },function(e){ busy(false); say(authErr(e)); });
  });
  $('form').addEventListener('submit',function(e){
    e.preventDefault();
    var em=$('#user-email').value.trim(), pw=$('#user-pw').value, up=d._mode==='up';
    if(!em){ say('请输入邮箱。'); return; }
    if(!pw){ say('请输入密码。'); return; }
    if(up&&pw.length<6){ say('密码太短，至少需要 6 位。'); return; }
    say(''); busy(true);
    (up?signUp(em,pw):signIn(em,pw)).then(afterSignIn,function(err){ busy(false); say(authErr(err)); $('#user-pw').select(); });
  });
  paint();
  (email?$('#user-pw'):$('#user-email')).focus();
  // fetch the account service now, so the Google button can open its window straight from the click;
  // and if this browser is already signed in (the page was closed half-way last time), carry on from there
  cloud().then(function(c){ if(c.auth.currentUser&&dlg===d&&!d._busy&&!(user&&user.uid===c.auth.currentUser.uid)){ busy(true); afterSignIn(c.auth.currentUser); } },noop);
}
// Signed in: offer to bring along what was saved while signed out, then switch this device to the account's library.
function afterSignIn(u){
  if(user&&user.uid===u.uid){ closeDialog(); return; }      // the same account again after an expired session: sync resumes by itself
  return guestSummary().then(function(g){
    if(!g.total||!dlg) return false;
    return new Promise(function(res){
      dlg._busy=true;
      dlg.innerHTML='<div class="mbox"><div class="mform user-form"><h2 class="mtitle">把这台设备上的内容放进账号？</h2>'+
        '<p class="fhint user-lead">这台设备上有未登录时保存的内容'+(g.docs?'：<b>'+g.docs+' 篇文档</b>':'')+'（连同标注、生词等共 '+g.total+' 条记录）。放进账号后会同步到云端，在你的其他设备上也能看到。</p>'+
        '<div class="mrow"><button type="button" class="btn ghost" data-a="no">不用，保持分开</button><button type="button" class="btn primary" data-a="yes">放进我的账号</button></div></div></div>';
      $('[data-a=yes]').addEventListener('click',function(){ res(true); });
      $('[data-a=no]').addEventListener('click',function(){ res(false); });
    });
  }).then(function(merge){
    if(dlg){ dlg._busy=true; dlg.innerHTML='<div class="mbox"><div class="mform user-form"><h2 class="mtitle">正在打开你的账号…</h2><p class="fhint user-lead">马上就好。</p></div></div>'; }
    return merge?adoptGuest(u.uid):0;
  }).catch(noop).then(function(){
    setLocalUser({uid:u.uid,email:u.email||'',name:u.displayName||''});
    reloadAllTabs();
  });
}

// ---- the signed-in account ----
export function openAccountDialog(){
  if(!user) return openSignIn();
  var d=openDialog('account','我的账号');
  d._view='main';
  paintAccount();
  cloud().then(function(c){ if(dlg===d){ d._fb=c.auth.currentUser; paintAccount(); } },noop);
}
function paintAccount(){
  if(!dlg||dlg._kind!=='account'||dlg._busy) return;
  var d=dlg, fb=d._fb, h='<div class="mbox"><div class="mform user-form">';
  if(d._view==='out'){
    h+='<h2 class="mtitle">退出登录</h2>'+
      (syncState.pending?'<p class="fhint user-lead user-warn">还有 '+syncState.pending+' 项改动没有传到云端。先点“立即同步”，或者保留这台设备上的内容，下次登录时会继续上传。</p>':'<p class="fhint user-lead">退出后，这台设备回到未登录状态；你的内容仍然在云端，再次登录就会回来。</p>')+
      '<label class="user-check"><input type="checkbox" id="user-drop"><span>同时清除这台设备上的账号内容和 AI 密钥（公用电脑建议勾选）</span></label>'+
      '<p class="ferr" hidden></p>'+
      '<div class="mrow"><button type="button" class="btn ghost" data-a="back">取消</button>'+(syncState.pending?'<button type="button" class="btn ghost" data-a="sync">立即同步</button>':'')+'<button type="button" class="btn primary" data-a="signout">退出登录</button></div>';
  } else if(d._view==='delete'){
    h+='<h2 class="mtitle">删除账号</h2>'+
      '<p class="fhint user-lead user-warn">这会永久删除你的账号和云端保存的全部内容（读物、译文、标注、生词），无法恢复。这台设备上的账号内容也会清除。需要的话，先用侧栏「⋯ → 导出备份」留一份。</p>'+
      '<label class="field"><span class="flabel">输入“删除”两个字确认</span><input class="finput" id="user-confirm" autocomplete="off"></label>'+
      '<p class="ferr" hidden></p>'+
      '<div class="mrow"><button type="button" class="btn ghost" data-a="back">取消</button><button type="button" class="btn danger" data-a="delete">永久删除</button></div>';
  } else {
    var unverified=fb&&fb.email&&!fb.emailVerified&&fb.providerData.every(function(p){ return p.providerId==='password'; });
    h+='<h2 class="mtitle">我的账号</h2>'+
      '<dl class="acct-stat"><dt>账号</dt><dd>'+esc(user.email||user.name||'')+(unverified?' <span class="user-tag">邮箱未验证</span> <button type="button" class="lnk" data-a="verify">重发验证邮件</button>':'')+'</dd>'+
      '<dt>云端同步</dt><dd><span id="user-sync">'+esc(syncText())+'</span> · <button type="button" class="lnk" data-a="sync">立即同步</button></dd>'+
      '<dt>这台设备</dt><dd>内容也保存在本机，离线时照常阅读，联网后自动同步</dd></dl>'+
      '<p class="fhint">自动同步的内容：读物和译文、文件夹、标注和笔记、生词本、阅读进度、学习模式的词汇量和统计。AI 密钥和外观设置只留在这台设备上。</p>'+
      '<details class="acct-more"><summary>密码与账号</summary><div class="user-more"><button type="button" class="btn ghost sm" data-a="reset">修改密码（发送重置邮件）</button><button type="button" class="btn ghost sm danger" data-a="todelete">删除账号…</button></div></details>'+
      '<p class="ferr" hidden></p>'+
      '<div class="mrow"><button type="button" class="btn ghost" data-a="toout">退出登录</button><button type="button" class="btn primary" data-a="close">完成</button></div>';
  }
  var keepOpen=d.querySelector('details.acct-more')&&d.querySelector('details.acct-more').open, msg=$('.ferr')&&!$('.ferr').hidden?[$('.ferr').textContent,$('.ferr').classList.contains('good')]:null;
  d.innerHTML=h+'</div></div>';
  if(keepOpen&&d.querySelector('details.acct-more')) d.querySelector('details.acct-more').open=true;
  if(msg&&d._view===d._painted) say(msg[0],msg[1]);
  d._painted=d._view;
  [].slice.call(d.querySelectorAll('[data-a]')).forEach(function(b){ b.addEventListener('click',function(){ accountAct(b.dataset.a); }); });
}
function accountAct(a){
  var d=dlg; if(!d) return;
  if(a==='close') return closeDialog();
  if(a==='back'){ d._view='main'; return paintAccount(); }
  if(a==='toout'){ d._view='out'; return paintAccount(); }
  if(a==='todelete'){ d._view='delete'; return paintAccount(); }
  if(a==='sync'){ syncNow().then(function(s){ if(s&&dlg===d) say('已同步。',true); }); return; }
  if(a==='verify') return resendVerification().then(function(){ say('验证邮件已发到 '+user.email+'。',true); },function(e){ say(authErr(e)); });
  if(a==='reset') return resetPassword(user.email).then(function(){ say('重置密码的邮件已发到 '+user.email+'。',true); },function(e){ say(authErr(e)); });
  if(a==='signout'){
    var drop=$('#user-drop').checked, uid=user.uid;
    busy(true);
    return signOutCloud().catch(noop).then(function(){ setLocalUser(null); if(drop) setAccount(null); return drop?dropLocal(uid):null; }).then(reloadAllTabs);
  }
  if(a==='delete'){
    if($('#user-confirm').value.trim()!=='删除'){ say('请输入“删除”两个字。'); return; }
    var id=user.uid;
    busy(true);
    return deleteAccount().then(function(){ setLocalUser(null); setAccount(null); return dropLocal(id); }).then(function(){ toast('账号已删除'); reloadAllTabs(); },
      function(e){ busy(false); say(authErr(e)); });
  }
}

export function startAccounts(){
  renderUserChip();
  if(!cloudOn) return;
  onSync(renderUserChip);
  setInterval(function(){ if(user&&syncState.phase==='idle') renderUserChip(); },60000);      // keeps "… 分钟前" honest
  if(user) startSync();
}
