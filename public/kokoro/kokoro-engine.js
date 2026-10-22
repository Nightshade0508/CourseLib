// Kokoro-82M v1.1 (English + Chinese), run locally with onnxruntime-web (WASM).
// The page hands over the model and runtime bytes; this module answers the
// library's requests for them and turns phonemes into 24 kHz audio.
const HF = 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/';
// kokoro-js only accepts its own English voice names, so the v1.1 English voices ride on three of them
const ALIAS = { af_maple: 'af_heart', af_sol: 'af_bella', bf_vale: 'bf_emma' };
const REAL = { af_heart: 'af_maple', af_bella: 'af_sol', bf_emma: 'bf_vale' };
let M = null, tts = null, loading = null, T = null;
const realFetch = globalThis.fetch.bind(globalThis);
const json = (o) => new Response(JSON.stringify(o), { headers: { 'Content-Type': 'application/json' } });

function b64(str) {
  str = str.replace(/\s+/g, '');
  if (Uint8Array.fromBase64) return Uint8Array.fromBase64(str);
  const bin = atob(str), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function voiceFile(name) {
  const real = REAL[name] || name;
  let err, cache = null;
  try { if (M.cache && globalThis.caches) cache = await caches.open(M.cache); } catch (e) {}
  for (const base of M.voices) {
    try {
      const u = base + real + '.txt';
      if (cache) { const hit = await cache.match(u); if (hit) return new Response(await hit.arrayBuffer()); }
      const r = await realFetch(u);
      if (!r.ok) { err = new Error(r.status + ' ' + u); continue; }
      const bytes = b64(await r.text());
      if (cache) { try { await cache.put(u, new Response(bytes.slice(0))); } catch (e) {} } // counts as downloaded in the voice manager
      return new Response(bytes);
    } catch (e) { err = e; }
  }
  throw err || new Error('voice not found: ' + real);
}
function patchedFetch(input, init) {
  const url = typeof input === 'string' ? input : (input && input.url) || String(input);
  if (url.startsWith(HF)) {
    const p = url.slice(HF.length).split('?')[0];
    if (p === 'config.json') return Promise.resolve(json({ model_type: 'style_text_to_speech_2', architectures: ['StyleTextToSpeech2Model'] }));
    if (p === 'tokenizer_config.json') return Promise.resolve(json({ tokenizer_class: 'PreTrainedTokenizer', model_max_length: 512 }));
    if (p === 'tokenizer.json') return Promise.resolve(json({
      version: '1.0', truncation: null, padding: null, normalizer: null, decoder: null, pre_tokenizer: null, post_processor: null,
      added_tokens: [{ id: 0, content: '$', single_word: false, lstrip: false, rstrip: false, normalized: false, special: true }],
      model: { vocab: Object.assign({ '$': 0 }, M.vocab) }
    }));
    if (p.startsWith('onnx/model')) return Promise.resolve(new Response(M.modelBuf, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(M.modelBuf.byteLength) } }));
    if (p.startsWith('voices/')) return voiceFile(p.slice(7).replace(/\.bin$/, ''));
    return Promise.resolve(new Response('', { status: 404 }));
  }
  if (/ort-wasm-simd-threaded\.jsep\.wasm(\?|$)/.test(url)) return Promise.resolve(new Response(M.wasmBuf, { headers: { 'Content-Type': 'application/wasm' } }));
  return realFetch(input, init);
}
function toIds(ph) {
  const ids = [0];
  for (const ch of ph) { const id = M.vocab[ch]; if (id != null) ids.push(id); }
  if (ids.length > 511) ids.length = 511;
  ids.push(0);
  return new T('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]);
}

export async function init(manifest) {
  if (tts) return true;
  if (loading) return loading;
  M = manifest;
  globalThis.fetch = patchedFetch;
  // no browser-cache copies: the model is already cached by the page, and older voice files must not be reused
  try {
    if (globalThis.caches && caches.open) {
      const open = caches.open.bind(caches), none = { match: async () => undefined, put: async () => {} };
      caches.open = (n) => (n === 'transformers-cache' || n === 'kokoro-voices') ? Promise.resolve(none) : open(n);
    }
  } catch (e) {}
  loading = (async () => {
    let mod, err;
    for (const src of M.lib) { try { mod = await import(src); break; } catch (e) { err = e; } }
    if (!mod) throw new Error('kokoro-js: ' + (err && err.message || err));
    let base = null;
    for (const b of M.ortBase) { try { await import(b + 'ort-wasm-simd-threaded.jsep.mjs'); base = b; break; } catch (e) { err = e; } }
    if (!base) throw new Error('onnxruntime: ' + (err && err.message || err));
    mod.env.wasmPaths = base;
    tts = await mod.KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'wasm' });
    T = tts.tokenizer('a').input_ids.constructor;
    // English: espeak phonemes from kokoro-js, adjusted to the v1.1 symbol set
    tts.tokenizer = (ph) => ({ input_ids: toIds(ph.replace(/ɚɹ/g, 'əɹ').replace(/ɚ/g, 'əɹ').replace(/ɝ/g, 'ɜɹ')) });
    M.modelBuf = null;
    return true;
  })();
  try { return await loading; } catch (e) { loading = null; throw e; }
}

export async function generate(text, voice, speed, lang, phonemes) {
  let a;
  if (lang === 'zh') a = await tts.generate_from_ids(toIds(phonemes || ''), { voice, speed });
  else a = await tts.generate(text, { voice: ALIAS[voice] || 'af_heart', speed });
  return { samples: a.audio, sr: a.sampling_rate };
}
