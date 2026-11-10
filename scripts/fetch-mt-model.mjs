// Downloads the free translation model (opus-mt-en-zh, ONNX build by Xenova) from Hugging Face
// into public/models/, so the site serves it itself and never depends on Hugging Face at runtime.
// The two ONNX files are split into ≤20 MB parts (some static hosts cap file size at 25 MiB);
// public/runtime/mt-worker.js joins them again while downloading. Run once, or to update the model.
import { mkdir, rm, writeFile } from 'node:fs/promises';

const MODEL = 'Xenova/opus-mt-en-zh';
const REV = process.env.MT_REVISION || 'main';
const FILES = ['config.json', 'generation_config.json', 'tokenizer.json', 'tokenizer_config.json',
  'onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx'];
const PART = 20 * 1024 * 1024;
const out = `public/models/${MODEL}/`;

await rm(out, { recursive: true, force: true });
await mkdir(out + 'onnx', { recursive: true });
const parts = {};
for (const f of FILES) {
  const res = await fetch(`https://huggingface.co/${MODEL}/resolve/${REV}/${f}`);
  if (!res.ok) throw new Error(`${f}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!f.endsWith('.onnx')) { await writeFile(out + f, buf); console.log(f, buf.length); continue; }
  const n = Math.ceil(buf.length / PART);
  for (let i = 0; i < n; i++) await writeFile(`${out}${f}.part${i}`, buf.subarray(i * PART, (i + 1) * PART));
  parts[f.split('/').pop()] = { size: buf.length, parts: n };
  console.log(f, buf.length, `→ ${n} parts`);
}
await writeFile(out + 'onnx/parts.json', JSON.stringify(parts, null, 2) + '\n');
await writeFile(out + 'README.md', `# opus-mt-en-zh (ONNX, 8-bit)

English → Chinese translation model used by the free translator.

- Model: [Helsinki-NLP/opus-mt-en-zh](https://huggingface.co/Helsinki-NLP/opus-mt-en-zh), © Language Technology Research Group at the University of Helsinki, licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- ONNX conversion: [${MODEL}](https://huggingface.co/${MODEL}).
- Changes: the two ONNX files are split into parts (\`*.onnx.partN\`, listed in \`onnx/parts.json\`) and joined again in the browser; the bytes are unchanged.

Re-download with \`node scripts/fetch-mt-model.mjs\`.
`);
