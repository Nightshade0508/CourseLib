// Free translation and dictionary that need no account.
import './add-doc.js';
import { noop } from './util.js';
import { userDocs } from './state.js';
import { show } from './show.js';
import { confirmBox } from './organize.js';
import {
  chunkBody, chunkRef, doneCount, isText, loadPdfData, metaUpdate, saveAllChunks, setStat,
} from './doc-store.js';
import { applyItem, markPend } from './doc-render.js';
import { readyToTranslate } from './estimate.js';

// a readable title for pasted text that will not get an AI-written one
export function openingWords(t){
  var first=String(t).replace(/\s+/g,' ').trim().split(/(?<=[.!?])\s/)[0];
  var w=first.split(' ').slice(0,8).join(' ').replace(/[,;:.]+$/,'');
  return w.length>60?w.slice(0,58)+'…':(w||'Pasted text');
}
export function defaultTier(){ return window.PTL&&PTL.account()?'default':'free'; }
// translate one paragraph at a time with the browser / open-source translator
export function translateFree(id,data,idxs,job){
  var ctl=new AbortController(); job.ctls.push(ctl);
  var chain=Promise.resolve();
  idxs.forEach(function(i){
    chain=chain.then(function(){
      if(job.stop) throw {code:'cancelled'};
      var it=data.items[i]; markPend(id,i,true);
      return PTL.mt.translate(it.en,{signal:ctl.signal}).then(function(zh){
        markPend(id,i,false);
        if(zh){ it.zh=zh; applyItem(id,i); }
      });
    });
  });
  return chain.then(save,function(e){ save(); throw e; });
  function save(){
    idxs.forEach(function(i){ markPend(id,i,false); });
    var cs={}; idxs.forEach(function(i){ cs[data.chunkOf[i]]=1; });
    job.wchain=(job.wchain||Promise.resolve()).then(function(){
      return Promise.all(Object.keys(cs).map(function(c){ return chunkRef(id,+c).set(chunkBody(id,data,+c)); }));
    }).then(function(){
      var dc=doneCount(data);
      setStat(id,{done:dc[0],n:dc[1]});
      return metaUpdate(id,{done:dc[0],beat:Date.now()});
    }).catch(noop);
    return job.wchain;
  }
}
// free word lookup: Wiktionary definitions + a gloss from the free translator when it is already on this device
export function freeLookup(word){
  return Promise.all([
    PTL.dict(word).catch(function(){ return null; }),
    PTL.mt.status().then(function(st){ return st.ready?PTL.mt.translate(word).catch(function(){ return ''; }):''; },function(){ return ''; })
  ]).then(function(r){
    var d=r[0], zh=r[1];
    if(!d&&!zh) throw {code:'not_found'};
    var s0=(d&&d.senses[0])||{}, more=d?d.senses.slice(1,3).map(function(x){ return (x.pos?x.pos+'. ':'')+x.def; }).join('  ·  '):'';
    return {lemma:d?d.lemma:word,pos:s0.pos||'',ipa:d?d.ipa:'',def:s0.def||'',zh:zh,note:more?'其他义项：'+more:''};
  });
}
// replace a free translation with the AI one
export function aiRetranslate(id){
  if(!(window.PTL&&PTL.account())){ PTL.openAccount(); return; }
  confirmBox('用 AI 重新翻译全文？','现有的免费译文会被清空，AI 会逐段重新翻译。开始前会先显示预计费用。','重新翻译',function(){
    return loadPdfData(id).then(function(data){
      data.items.forEach(function(it){ if(isText(it)) it.zh=''; });
      return saveAllChunks(id,data).then(function(){
        var dc=doneCount(data);
        if(userDocs[id]){ userDocs[id].tier='default'; userDocs[id].done=0; }
        return metaUpdate(id,{tier:'default',done:0,n:dc[1],status:'paused',err:''});
      }).then(function(){ show(id); readyToTranslate(id,false); });
    });
  });
}
// "遮" mode: tap a blurred translation to reveal it
document.addEventListener('click',function(e){
  if(!document.body.classList.contains('zh-blur')||!e.target.closest) return;
  var z=e.target.closest('.docbody .zh'); if(z) z.classList.toggle('reveal');
});
