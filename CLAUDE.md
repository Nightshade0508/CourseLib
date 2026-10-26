# Parallel Text Library

Static site, no framework or bundler. Originally a claude.ai Artifact.

- `public/index.html` is the whole app (one IIFE, ES5-style `var`/`function`, Chinese UI strings). Keep that style.
- The app reaches AI, storage and downloads only through `window.claude.use('sample' | 'db' | 'downloads')`. `public/runtime/runtime.js` implements those for the standalone site:
  - `sample(prompt, {modelTier:'quick', signal, onText({text, delta}), images:[Blob]})` → `{text}`; `sample.json(...)`; `sample.limits()`. Errors are thrown as `{code, message}`; the codes are mapped to Chinese messages in `pdfErr` / `sampleErr` in index.html.
  - Providers: OpenRouter (OAuth PKCE), Anthropic API key (official SDK, bundled at `public/vendor/anthropic-sdk.mjs`), any OpenAI-compatible endpoint.
  - `window.PTL`: `account()`, `openAccount()`, `estimate({inTokens,outTokens,tier})` (USD from Anthropic list prices / OpenRouter's price list), `exportAll()` / `importAll(backup, 'merge'|'replace')` (db + `ptl:` localStorage keys, never the AI key).
  - `db`: Firestore-like paths (`docs/<id>`, `pdf/<id>/chunks/<c>`) in IndexedDB, with `onSnapshot` and cross-tab sync. `update()` rejects on a missing doc on purpose.
- Content: `content/library.json` + `content/docs/*.json`. `node scripts/build.mjs` writes `dist/` with only `"public": true` docs; `--all` includes everything. The public site ships no readings (only the empty "mine" folder); `content/docs/` is gitignored because the repo is public.
- Test: `npm run dev`, then drive it with Playwright and mock `api.anthropic.com` / `openrouter.ai` with `page.route`.
