// Copies transformers.js and the onnxruntime WebAssembly files it loads into
// public/vendor/transformers/, so the free in-browser translator needs no CDN.
// Run after changing the @huggingface/transformers version in package.json.
import { copyFile, mkdir, readFile, readdir, rm } from 'node:fs/promises';

const out = 'public/vendor/transformers/';
const tf = 'node_modules/@huggingface/transformers/';
const ort = tf + 'node_modules/onnxruntime-web/dist/';
const ortDir = await readdir(ort).then(() => ort, () => 'node_modules/onnxruntime-web/dist/');
const { version } = JSON.parse(await readFile(tf + 'package.json', 'utf8'));

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await copyFile(tf + 'dist/transformers.min.js', out + 'transformers.min.js');
for (const f of ['ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm'])
  await copyFile(ortDir + f, out + f);
console.log(`public/vendor/transformers/ ← @huggingface/transformers ${version}`);
