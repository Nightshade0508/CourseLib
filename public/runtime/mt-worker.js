// Free English → Chinese translation that runs entirely in this browser:
// the open-source opus-mt-en-zh model (Helsinki-NLP, CC BY 4.0) through transformers.js.
// The model (~113 MB) is served by this site from models/ (see scripts/fetch-mt-model.mjs),
// downloaded once and then cached by the browser. Nothing is loaded from Hugging Face.
import { pipeline, env } from '../vendor/transformers/transformers.min.js';

const MODELS = new URL('../models/', import.meta.url).href;
// Treat this site's models/ folder as the model hub. (Not env.localModelPath: in transformers.js 4.3
// a local path that is a URL makes the tokenizer look missing.)
env.allowLocalModels = false;
env.allowRemoteModels = true;
env.remoteHost = MODELS;
env.remotePathTemplate = '{model}/';
env.backends.onnx.wasm.wasmPaths = new URL('../vendor/transformers/', import.meta.url).href;

// The ONNX files are stored as ≤20 MB parts (onnx/parts.json); join them while they download.
const MODEL = 'Xenova/opus-mt-en-zh';
const plainFetch = env.fetch;
let partsP = null;
function partsList() {
  if (!partsP) partsP = plainFetch(MODELS + MODEL + '/onnx/parts.json').then((r) => (r.ok ? r.json() : {}), () => ({}));
  return partsP;
}
env.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.startsWith(MODELS) || !url.endsWith('.onnx')) return plainFetch(input, init);
  const info = (await partsList())[url.split('/').pop()];
  if (!info) return plainFetch(input, init);
  // a size check (Range: bytes=0-0) needs no download
  if (new Headers(init && init.headers).has('Range')) return new Response(null, { status: 200, headers: { 'content-length': String(info.size) } });
  let i = 0, reader = null;
  const body = new ReadableStream({
    async pull(ctrl) {
      for (;;) {
        if (!reader) {
          if (i >= info.parts) { ctrl.close(); return; }
          const r = await plainFetch(`${url}.part${i++}`, init);
          if (!r.ok) throw new Error(`${url}.part${i - 1}: HTTP ${r.status}`);
          reader = r.body.getReader();
        }
        const { done, value } = await reader.read();
        if (done) { reader = null; continue; }
        ctrl.enqueue(value);
        return;
      }
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'application/octet-stream', 'content-length': String(info.size) } });
};

let tr = null, loading = null;

function load() {
  if (loading) return loading;
  const files = {};
  loading = pipeline('translation', MODEL, {
    dtype: 'q8',
    progress_callback: (p) => {
      if (p.status !== 'progress' || !p.total) return;
      files[p.file] = [p.loaded, p.total];
      let got = 0, all = 0;
      for (const k in files) { got += files[k][0]; all += files[k][1]; }
      self.postMessage({ type: 'progress', loaded: got, total: all });
    },
  }).then((t) => { tr = t; return t; }, (e) => { loading = null; throw e; });
  return loading;
}

self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === 'load') { await load(); self.postMessage({ type: 'ready' }); }
    else if (m.type === 'tr') {
      await load();
      const out = [];
      for (const t of m.texts) out.push((await tr(t, { max_new_tokens: 512 }))[0].translation_text);
      self.postMessage({ type: 'out', id: m.id, texts: out });
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: m.id, message: String((err && err.message) || err) });
  }
};
