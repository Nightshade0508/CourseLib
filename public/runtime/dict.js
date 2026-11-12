// Free dictionary lookups (dictionaryapi.dev: Wiktionary data, no key).
import './mt.js';

export function dictLookup(word){
  return fetch('https://api.dictionaryapi.dev/api/v2/entries/en/'+encodeURIComponent(word.toLowerCase())).then(function(r){
    if(r.status===404) return null;
    if(!r.ok) throw {code:'dict_failed',message:'词典服务暂时不可用'};
    return r.json();
  }).then(function(j){
    if(!j||!j[0]) return null;
    var e=j[0], ph=(e.phonetics||[]).filter(function(p){ return p.text; })[0], audio=(e.phonetics||[]).filter(function(p){ return p.audio; })[0];
    var senses=[];
    (e.meanings||[]).forEach(function(m){ (m.definitions||[]).slice(0,2).forEach(function(d){ if(senses.length<4) senses.push({pos:m.partOfSpeech||'',def:d.definition||'',ex:d.example||''}); }); });
    return {lemma:e.word||word,ipa:(ph&&ph.text)||e.phonetic||'',audio:audio?audio.audio:'',senses:senses};
  });
}
