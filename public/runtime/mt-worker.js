// Free English → Chinese translation that runs entirely in this browser:
// the open-source opus-mt-en-zh model (Helsinki-NLP, CC-BY-4.0) through transformers.js.
// The model (~113 MB) is downloaded from Hugging Face once and then cached by the browser.
import { pipeline, env } from '../vendor/transformers/transformers.min.js';

env.allowLocalModels = false;
env.backends.onnx.wasm.wasmPaths = new URL('../vendor/transformers/', import.meta.url).href;

const MODEL = 'Xenova/opus-mt-en-zh';
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
