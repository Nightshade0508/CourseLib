import { init, generate } from './kokoro-engine.js';
let chain = Promise.resolve();
self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') {
    init(m.manifest).then(() => self.postMessage({ type: 'ready' }), (err) => self.postMessage({ type: 'error', message: String((err && err.message) || err) }));
  } else if (m.type === 'gen') {
    chain = chain.then(async () => {
      try {
        const t0 = performance.now();
        const { samples, sr } = await generate(m.text, m.voice, m.speed, m.lang, m.phonemes);
        self.postMessage({ type: 'audio', id: m.id, samples, sr, ms: performance.now() - t0 }, [samples.buffer]);
      } catch (err) { self.postMessage({ type: 'genError', id: m.id, message: String((err && err.message) || err) }); }
    });
  }
};
self.postMessage({ type: 'alive' });
