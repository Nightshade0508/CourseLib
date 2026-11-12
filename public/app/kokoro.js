// Kokoro-82M neural voices, generated locally in the browser.
import './tts.js';
import { lsGet } from './util.js';
import { coarse } from './annotations.js';
import { tts } from './tts.js';

export var KVOICES={en:[['af_maple','Maple','美式 · 女声'],['af_sol','Sol','美式 · 女声'],['bf_vale','Vale','英式 · 女声']],
  zf:[['zf_051','女声 · 温和（推荐）'],['zf_048','女声 · 清亮舒缓'],['zf_090','女声 · 清亮'],['zf_044','女声 · 明快']],
  zm:[['zm_081','男声 · 低沉舒缓'],['zm_053','男声 · 沉稳'],['zm_095','男声 · 明亮轻快']]};
export var KVOCAB={";":1,":":2,",":3,".":4,"!":5,"?":6,"/":7,"—":9,"…":10,"\"":11,"(":12,")":13,"“":14,"”":15," ":16,"̃":17,"ʣ":18,"ʥ":19,"ʦ":20,"ʨ":21,"ᵝ":22,"ㄓ":23,"A":24,"I":25,"ㄅ":30,"O":31,"ㄆ":32,"Q":33,"R":34,"S":35,"T":36,"ㄇ":37,"ㄈ":38,"W":39,"ㄉ":40,"Y":41,"ᵊ":42,"a":43,"b":44,"c":45,"d":46,"e":47,"f":48,"ㄊ":49,"h":50,"i":51,"j":52,"k":53,"l":54,"m":55,"n":56,"o":57,"p":58,"q":59,"r":60,"s":61,"t":62,"u":63,"v":64,"w":65,"x":66,"y":67,"z":68,"ɑ":69,"ɐ":70,"ɒ":71,"æ":72,"ㄋ":73,"ㄌ":74,"β":75,"ɔ":76,"ɕ":77,"ç":78,"ㄍ":79,"ɖ":80,"ð":81,"ʤ":82,"ə":83,"ㄎ":84,"ㄦ":85,"ɛ":86,"ɜ":87,"ㄏ":88,"ㄐ":89,"ɟ":90,"ㄑ":91,"ɡ":92,"ㄒ":93,"ㄔ":94,"ㄕ":95,"ㄗ":96,"ㄘ":97,"ㄙ":98,"月":99,"ㄚ":100,"ɨ":101,"ɪ":102,"ʝ":103,"ㄛ":104,"ㄝ":105,"ㄞ":106,"ㄟ":107,"ㄠ":108,"ㄡ":109,"ɯ":110,"ɰ":111,"ŋ":112,"ɳ":113,"ɲ":114,"ɴ":115,"ø":116,"ㄢ":117,"ɸ":118,"θ":119,"œ":120,"ㄣ":121,"ㄤ":122,"ɹ":123,"ㄥ":124,"ɾ":125,"ㄖ":126,"ㄧ":127,"ʁ":128,"ɽ":129,"ʂ":130,"ʃ":131,"ʈ":132,"ʧ":133,"ㄨ":134,"ʊ":135,"ʋ":136,"ㄩ":137,"ʌ":138,"ɣ":139,"ㄜ":140,"ㄭ":141,"χ":142,"ʎ":143,"十":144,"压":145,"言":146,"ʒ":147,"ʔ":148,"阳":149,"要":150,"阴":151,"应":152,"用":153,"又":154,"中":155,"ˈ":156,"ˌ":157,"ː":158,"穵":159,"外":160,"万":161,"ʰ":162,"王":163,"ʲ":164,"为":165,"文":166,"瓮":167,"我":168,"3":169,"5":170,"1":171,"2":172,"4":173,"元":175,"云":176,"ᵻ":177};
export var KK={phase:'idle',pct:0,workers:[],queue:[],jobs:{},seq:0,cache:new Map(),qid:0,load:null,ctx:null,src:null,paused:false,failed:false,waiting:false,rtf:[],slowNoted:false};
export var lowPower=coarse.matches||(navigator.deviceMemory&&navigator.deviceMemory<4);
export function kkAvailable(){ return !KK.failed&&!!window.WebAssembly&&!!(window.AudioContext||window.webkitAudioContext); }
function kkKnown(name){ var l=tts.lang==='zh'?KVOICES.zf.concat(KVOICES.zm):KVOICES.en; return l.some(function(k){ return k[0]===name; }); }
export function voiceSel(){
  var v=lsGet('ttsVoice:'+tts.lang,'');
  if(v.indexOf('kokoro:')===0&&!kkKnown(v.slice(7))) v=''; // a voice from an older version of the library
  if(!v&&!lowPower&&kkAvailable()) v=tts.lang==='zh'?'kokoro:zf_051':'kokoro:af_maple';
  if(v.indexOf('kokoro:')===0&&!kkAvailable()) return '';
  return v;
}
export function useKokoro(){ return voiceSel().indexOf('kokoro:')===0; }
export function kkVoice(){ return voiceSel().slice(7); }
export function kkUrl(p){ return new URL(p,document.baseURI).href; }
export var JD='https://cdn.jsdelivr.net/npm/', KSIZE=190044304+28794696;
export function kkSets(){
  return {
    model:[[0,1,2,3,4,5,6,7,8,9,10,11,12].map(function(i){ return kkUrl('kokoro/model11/model.part'+i+'.txt'); })],
    wasm:[[kkUrl('kokoro/ort/wasm.part0.txt'),kkUrl('kokoro/ort/wasm.part1.txt')],
          [JD+'@huggingface/transformers@3.5.1/dist/ort-wasm-simd-threaded.jsep.wasm']]
  };
}
export async function kkFetch(url,onBytes,opts){
  opts=opts||{};
  var cache=null;
  try{ cache=await caches.open('ptl-kokoro-v4'); var hit=await cache.match(url); if(hit){ var hb=await hit.arrayBuffer(); onBytes(hb.byteLength); return hb; } }catch(e){ cache=null; }
  var r=await fetch(url,opts.signal?{signal:opts.signal}:undefined); if(!r.ok) throw new Error('HTTP '+r.status);
  var buf, b64=!opts.raw&&/\.txt(\?|$)/.test(url);
  if(r.body&&r.body.getReader){
    var rd=r.body.getReader(), parts=[], n=0;
    for(;;){ var x=await rd.read(); if(x.done) break; parts.push(x.value); n+=x.value.byteLength; onBytes(x.value.byteLength); }
    var out=new Uint8Array(n), o=0; parts.forEach(function(c){ out.set(c,o); o+=c.byteLength; }); buf=out.buffer;
  } else { buf=await r.arrayBuffer(); onBytes(buf.byteLength); }
  if(b64) buf=kkB64(new TextDecoder().decode(buf)).buffer; // model parts are stored as base64 text
  if(cache){ try{ await cache.put(url,new Response(buf)); }catch(e){} }
  return buf;
}
export async function kkFetchSet(sets,onBytes){
  var err;
  for(var s=0;s<sets.length;s++){
    try{ var bufs=[]; for(var i=0;i<sets[s].length;i++) bufs.push(await kkFetch(sets[s][i],onBytes)); return await new Blob(bufs).arrayBuffer(); }
    catch(e){ err=e; }
  }
  throw err||new Error('download failed');
}
function kkB64(str){
  str=str.replace(/\s+/g,'');
  if(Uint8Array.fromBase64) return Uint8Array.fromBase64(str);
  var bin=atob(str), n=bin.length, out=new Uint8Array(n);
  for(var i=0;i<n;i++) out[i]=bin.charCodeAt(i);
  return out;
}
export var ZHMAP=null, ZHLEX=null, ZHMAXW=1, zhDataP=null;
export function setZHMAP(v){ return ZHMAP=v; }
export function setZHLEX(v){ return ZHLEX=v; }
export function setZHMAXW(v){ return ZHMAXW=v; }
export function setZhDataP(v){ return zhDataP=v; }
