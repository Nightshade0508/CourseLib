// Bundles the official Anthropic TypeScript SDK into one browser ES module
// (public/vendor/anthropic-sdk.mjs) so the site needs no CDN or bundler at runtime.
// Run after changing the @anthropic-ai/sdk version in package.json.
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

const { version } = JSON.parse(await readFile(new URL('../node_modules/@anthropic-ai/sdk/package.json', import.meta.url), 'utf8'));
await build({
  stdin: { contents: "export { default, Anthropic } from '@anthropic-ai/sdk';", resolveDir: process.cwd() },
  bundle: true, format: 'esm', platform: 'browser', target: 'es2020', minify: true,
  banner: { js: `/* @anthropic-ai/sdk ${version} (MIT) — bundled by scripts/vendor-sdk.mjs */` },
  outfile: 'public/vendor/anthropic-sdk.mjs',
});
console.log(`public/vendor/anthropic-sdk.mjs ← @anthropic-ai/sdk ${version}`);
