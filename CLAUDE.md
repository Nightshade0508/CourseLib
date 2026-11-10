# Parallel Text Library

Static site, no framework or bundler. Originally a claude.ai Artifact.

- `public/index.html` is the whole app (one IIFE, ES5-style `var`/`function`, Chinese UI strings). Keep that style.
- The app reaches AI, storage and downloads only through `window.claude.use('sample' | 'db' | 'downloads')`. `public/runtime/runtime.js` implements those for the standalone site:
  - `sample(prompt, {modelTier:'quick', signal, onText({text, delta}), images:[Blob]})` → `{text}`; `sample.json(...)`; `sample.limits()`. Errors are thrown as `{code, message}`; the codes are mapped to Chinese messages in `pdfErr` / `sampleErr` in index.html.
  - Providers: OpenRouter (OAuth PKCE), Anthropic API key (official SDK, bundled at `public/vendor/anthropic-sdk.mjs`), any OpenAI-compatible endpoint.
  - `window.PTL`: `account()`, `openAccount()`, `estimate({inTokens,outTokens,tier})` (USD from Anthropic list prices / OpenRouter's price list), `exportAll()` / `importAll(backup, 'merge'|'replace')` (db + `ptl:` localStorage keys, never the AI key).
  - Free tier (`meta.tier==='free'`, the default when signed out): `PTL.mt.status/prepare/translate` — Chrome/Edge `Translator` API (availability times out after 3 s), else opus-mt-en-zh in `runtime/mt-worker.js` via vendored transformers.js, served from `public/models/` (split into ≤20 MB parts, joined in the worker's `env.fetch`; `scripts/fetch-mt-model.mjs` refreshes it). `env.remoteHost` points at `models/` because `localModelPath` URLs break tokenizer detection in transformers.js 4.3. `PTL.dict(word)` = dictionaryapi.dev.
  - `db`: Firestore-like paths (`docs/<id>`, `pdf/<id>/chunks/<c>`) in IndexedDB, with `onSnapshot` and cross-tab sync. `update()` rejects on a missing doc on purpose.
- Sentence alignment (`alignAt`, `alignmentOf`): split EN/ZH into sentences, Gale–Church length alignment, painted with the CSS Highlight API (`::highlight(align)`), so no DOM changes. Learning mode "学" = `body.zh-blur`; `learn-smart` hides only `.zh.ez` paragraphs (≤1 word above `LEARN.level` by `public/data/en-words.txt` rank, or unlearned 生词本 words), underlines unknown words via `::highlight(unk)`, counts paragraphs read in `ptl:learn-stats` and adapts the level every 20 hidden paragraphs. `learnRefresh(pane)` runs from `buildToc` and on language change.
- Content: `content/library.json` + `content/docs/*.json`. `node scripts/build.mjs` writes `dist/` with only `"public": true` docs; `--all` includes everything. The public site ships no readings (only the empty "mine" folder); `content/docs/` is gitignored because the repo is public.
- Test: `npm run dev`, then drive it with Playwright and mock `api.anthropic.com` / `openrouter.ai` with `page.route`.
