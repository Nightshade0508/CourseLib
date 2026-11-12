// Accounts and the cloud copy: Firebase Authentication + Cloud Firestore. Off unless public/config.js
// carries a Firebase configuration; the SDK (vendor/firebase.mjs) is fetched only then.
import './prices.js';
import { noop } from './util.js';

var CONFIG=window.PTL_CONFIG||{};
var FB=CONFIG.firebase||null, EMU=CONFIG.emulators||null;      // emulators: local development and the test suite
export var cloudOn=!!(FB&&FB.apiKey&&FB.projectId);

// → {fb: the SDK, auth, fs}
var cloudP=null;
export var live=null;              // the same, once loaded (sign-in with a popup must not wait for a download)
export function cloud(){
  if(!cloudOn) return Promise.reject({code:'cloud_off'});
  if(!cloudP){
    cloudP=import(new URL('../vendor/firebase.mjs',import.meta.url).href).then(function(fb){
      var app=fb.initializeApp(FB);
      var auth=fb.initializeAuth(app,{persistence:[fb.indexedDBLocalPersistence,fb.browserLocalPersistence],popupRedirectResolver:fb.browserPopupRedirectResolver});
      var fs=fb.getFirestore(app);
      auth.languageCode='zh-CN';
      if(EMU&&EMU.auth) fb.connectAuthEmulator(auth,EMU.auth,{disableWarnings:true});
      if(EMU&&EMU.firestore){ var hp=String(EMU.firestore).split(':'); fb.connectFirestoreEmulator(fs,hp[0],+hp[1]); }
      live={fb:fb,auth:auth,fs:fs};
      return live;
    });
    cloudP.catch(function(){ cloudP=null; });
  }
  return cloudP;
}

// cb(user | null) now and on every sign-in / sign-out
export function onUser(cb){ return cloud().then(function(c){ return c.fb.onAuthStateChanged(c.auth,cb); }); }
export function signUp(email,password){
  return cloud().then(function(c){
    return c.fb.createUserWithEmailAndPassword(c.auth,email,password).then(function(r){
      c.fb.sendEmailVerification(r.user).catch(noop);
      return r.user;
    });
  });
}
export function signIn(email,password){ return cloud().then(function(c){ return c.fb.signInWithEmailAndPassword(c.auth,email,password); }).then(function(r){ return r.user; }); }
// call from a click, after cloud() has loaded (the dialog loads it when it opens), or the popup may be blocked
export function signInGoogle(){
  return (live?Promise.resolve(live):cloud()).then(function(c){
    var p=new c.fb.GoogleAuthProvider(); p.setCustomParameters({prompt:'select_account'});
    return c.fb.signInWithPopup(c.auth,p);
  }).then(function(r){ return r.user; });
}
export function resetPassword(email){ return cloud().then(function(c){ return c.fb.sendPasswordResetEmail(c.auth,email); }); }
export function resendVerification(){ return cloud().then(function(c){ if(c.auth.currentUser) return c.fb.sendEmailVerification(c.auth.currentUser); }); }
export function signOutCloud(){ return cloud().then(function(c){ return c.fb.signOut(c.auth); }); }

// The account's records live at users/<uid>/records/<encoded path>:
//   p  the record's path ("docs/abc")        d  its data as JSON text (null once deleted)
//   x  deleted                                m  when the edit was made (device clock, ms)
//   by the device that wrote it              u  when the cloud received it (orders the change list)
function recId(path){ return encodeURIComponent(path); }
export function remoteFor(uid,device){
  function col(c){ return c.fb.collection(c.fs,'users',uid,'records'); }
  return {
    pull:function(cursor,max){
      return cloud().then(function(c){
        var parts=[col(c),c.fb.orderBy('u'),c.fb.orderBy(c.fb.documentId())];
        if(cursor) parts.push(c.fb.startAfter(new c.fb.Timestamp(cursor.s,cursor.n),cursor.id));
        parts.push(c.fb.limit(max));
        return c.fb.getDocs(c.fb.query.apply(null,parts)).then(function(snap){
          var changes=[], next=cursor||null;
          snap.docs.forEach(function(d){
            var x=d.data();
            if(x.u) next={s:x.u.seconds,n:x.u.nanoseconds,id:d.id};
            if(typeof x.p!=='string') return;
            var data; if(!x.x){ try{ data=JSON.parse(x.d); }catch(e){ return; } }
            changes.push({path:x.p,data:data,del:!!x.x,m:+x.m||0,by:x.by});
          });
          return {changes:changes,cursor:next,more:snap.docs.length>=max};
        });
      });
    },
    push:function(records){
      return cloud().then(function(c){
        var b=c.fb.writeBatch(c.fs);
        records.forEach(function(r){
          b.set(c.fb.doc(col(c),recId(r.path)),{p:r.path,d:r.del?null:JSON.stringify(r.data),x:!!r.del,m:r.m,by:device,u:c.fb.serverTimestamp()});
        });
        return b.commit();
      });
    },
    // delete every record of the account (used when the account itself is deleted)
    wipe:function(){
      return cloud().then(function step(c){
        return c.fb.getDocs(c.fb.query(col(c),c.fb.limit(300))).then(function(snap){
          if(!snap.docs.length) return;
          var b=c.fb.writeBatch(c.fs);
          snap.docs.forEach(function(d){ b.delete(d.ref); });
          return b.commit().then(function(){ return step(c); });
        });
      });
    }
  };
}
// Deleting the account needs a recent sign-in (Firebase refuses otherwise), so check before wiping anything.
export function deleteAccount(){
  return cloud().then(function(c){
    var u=c.auth.currentUser;
    if(!u) throw {code:'auth/no-current-user'};
    var last=Date.parse(u.metadata&&u.metadata.lastSignInTime||'')||0;
    if(Date.now()-last>4*60*1000) throw {code:'auth/requires-recent-login'};
    return remoteFor(u.uid,'').wipe().then(function(){ return c.fb.deleteUser(u); });
  });
}
export function authErr(e){
  var c=(e&&e.code)||'';
  return ({
    'auth/invalid-credential':'邮箱或密码不对。',
    'auth/wrong-password':'邮箱或密码不对。',
    'auth/user-not-found':'邮箱或密码不对。',
    'auth/invalid-login-credentials':'邮箱或密码不对。',
    'auth/email-already-in-use':'这个邮箱已经注册过，请直接登录。',
    'auth/weak-password':'密码太短，至少需要 6 位。',
    'auth/invalid-email':'邮箱地址的格式不对。',
    'auth/missing-password':'请输入密码。',
    'auth/missing-email':'请输入邮箱。',
    'auth/user-disabled':'这个账号已被停用。',
    'auth/too-many-requests':'尝试次数太多，请过几分钟再试。',
    'auth/network-request-failed':'连不上账号服务，请检查网络后再试。',
    'auth/popup-blocked':'浏览器拦截了登录窗口。请允许这个网站弹出窗口，然后再点一次。',
    'auth/popup-closed-by-user':'',
    'auth/cancelled-popup-request':'',
    'auth/account-exists-with-different-credential':'这个邮箱已经用另一种方式注册过，请用原来的方式登录。',
    'auth/operation-not-allowed':'网站还没有开启这种登录方式（站长需要在 Firebase 控制台里启用）。',
    'auth/unauthorized-domain':'这个网址还没有加入 Firebase 的授权域名（站长需要在 Firebase 控制台里添加）。',
    'auth/requires-recent-login':'为了安全，删除账号前请先退出，再重新登录一次，然后在几分钟内操作。',
    'cloud_off':'这个网站还没有开启账号功能。'
  })[c] ?? (!c&&/import|fetch|load/i.test(String(e&&e.message))?'连不上账号服务，请检查网络后再试。':'出错了：'+((e&&e.message)||'请稍后再试'));
}
