# Parallel Text Library

Static site, no framework or bundler: the browser loads the ES modules in `public/` as they are. Originally a single-file claude.ai Artifact. Chinese UI strings; code in ES5 style (`var`, `function`) plus `import`/`export`. Keep that style.

## Layout

- `public/index.html` is only the HTML shell and the SVG icon sprite. Styles are in `public/css/*.css` (linked in cascade order).
- `public/app/*.js`: the app, one feature per file; the first comment of each file says what it owns. `app/main.js` is the entry.
  - **Load order chain**: the files run in a fixed order. Each file's first line is `import './<the file before it>.js';`, and `main.js` imports the last one (`boot.js`). A new file that does work at load time (listeners, DOM, reads other files' variables) must be linked into the chain; pure helpers go in `app/lib/` and need no place in it.
  - Imports are read-only bindings: to assign another file's variable use its exported setter (`setCurrent(id)`, `setKeepScrollOnce(true)`, …), adding one next to the declaration if needed.
  - `tests/unit/modules.test.mjs` enforces all of this statically (names exist, nothing undeclared, no assignment to imports, chain complete). Run `npm run test:unit` after any structural change.
- `public/app/lib/*.js`: pure logic with unit tests (`sentences.js` alignment, `words.js` vocabulary rank, `article.js` reader Markdown → blocks, `estimate.js`).
- `public/runtime/*.js` (its own chain, ending in `runtime/main.js`, imported first by `app/main.js`): everything the app reaches through `window.claude.use('sample' | 'db' | 'downloads')` and `window.PTL`.

## Runtime

- `sample(prompt, {modelTier:'quick', signal, onText({text, delta}), images:[Blob]})` → `{text}`; `sample.json(...)`; `sample.limits()`. Errors are thrown as `{code, message}`; codes are mapped to Chinese in `pdfErr` (app/upload.js) / `sampleErr` (app/citations.js).
- Providers (`ai-account.js`, `openrouter.js`, `sample.js`): OpenRouter (OAuth PKCE), Anthropic API key (official SDK, `public/vendor/anthropic-sdk.mjs`), any OpenAI-compatible endpoint. The key never leaves the browser except to that provider, and is never backed up or synced.
- `db` (`db.js`): Firestore-like paths (`docs/<id>`, `pdf/<id>/chunks/<c>`, `marks/<id>`, …) in IndexedDB, with `onSnapshot` and cross-tab sync. `update()` rejects on a missing doc on purpose.
  - Database name: `parallel-text-library` when signed out, `parallel-text-library::<uid>` per account (chosen at load from `localStorage['ptl-user']`; switching account = reload). Account databases also have `outbox` (path, m, del: what still has to be uploaded; written in the same transaction as the record) and `meta` (sync cursor, device id).
- Free tier (`meta.tier==='free'`, the default when signed out): `PTL.mt.status/prepare/translate` — Chrome/Edge `Translator` API (availability times out after 3 s), else opus-mt-en-zh in `runtime/mt-worker.js` via vendored transformers.js, served from `public/models/` (≤20 MB parts joined in the worker's `env.fetch`; `scripts/fetch-mt-model.mjs` refreshes it). `env.remoteHost` points at `models/` because `localModelPath` URLs break tokenizer detection in transformers.js 4.3. `PTL.dict(word)` = dictionaryapi.dev.
- `PTL.estimate`, `PTL.exportAll()` / `importAll(backup, 'merge'|'replace')` (db + `ptl:` localStorage keys, never the AI key).

## Accounts and sync (off unless `public/config.js` has a Firebase config; setup in docs/ACCOUNTS.md)

- `cloud.js`: lazy-loads `public/vendor/firebase.mjs` (app + auth + firestore/lite, bundled by `scripts/vendor-firebase.mjs`). Auth: email/password, Google popup, reset, verification, delete. Cloud records: `users/<uid>/records/<encodeURIComponent(path)>` = `{p, d (JSON text), x (deleted), m (edit time, device clock), by (device), u (serverTimestamp)}`. Rules: `firebase/firestore.rules`.
- `lib/sync-core.js` (pure, unit-tested): pull changes after a cursor `(u, id)`, apply unless the outbox has a newer `m`; push the outbox in batches; skip own echoes (`by`); records over ~0.95 MB are skipped and reported.
- `sync.js`: scheduling (2 s after a local write, on focus/online, every 60 s while visible, one tab at a time via Web Locks, backoff on errors), state for the chip (`PTL.sync.state()`), and the learning settings (`ptl:vlevel`, `ptl:vauto`, `ptl:learn`, `ptl:learn-stats`) synced as one record `prefs/learning` (the app reloads them on the `ptl:prefs` event).
- `user-ui.js`: the `#user` chip and dialogs. After sign-in: offer to adopt signed-out content (`adoptGuest`), write `ptl-user`, reload all tabs. Sign-out can also drop the account's local database and the AI key.
- `PTL.accounts`, `PTL.user()`, `PTL.openUser()`, `PTL.sync.now()`.

## Features worth knowing

- Documents: `docs/<id>` meta + `pdf/<id>/chunks/<c>` items `{k, p, en, zh}`; kinds `p`, `h`, `fn`, `pg` (page marker), `ref` (kept, never translated), `sep`, `img` (`src`, `alt`; never translated). `isText(it)` in app/doc-store.js says what counts as translatable.
- Web import (`app/import-url.js`): `READER` = Jina Reader (`https://r.jina.ai/<url>`, JSON), `lib/article.js` turns its Markdown into blocks, then `startItemsJob(..., 'url', ...)`. Images are hot-linked with `referrerpolicy="no-referrer"`; broken or tiny ones hide themselves.
- Sentence alignment (`app/align.js`, `lib/sentences.js`): Gale–Church length alignment, painted with the CSS Highlight API (`::highlight(align)`), no DOM changes. Learning mode "学" = `body.zh-blur`; `learn-smart` hides only `.zh.ez` paragraphs, underlines unknown words via `::highlight(unk)`, counts paragraphs in `ptl:learn-stats`, adapts the level every 20 hidden paragraphs. `learnRefresh(pane)` runs from `buildToc` and on language change.
- Content: `content/library.json` + `content/docs/*.json`. `node scripts/build.mjs` writes `dist/` with only `"public": true` docs (`--all` for everything) and injects `<link rel="modulepreload">` for every module. The public site ships no readings; `content/docs/` is gitignored because the repo is public.

## Tests (CI runs them before every deploy)

- `npm run test:unit` — `node --test tests/unit/*.test.mjs`.
- `npm run test:e2e` — Playwright against the built `dist/` (`playwright.config.mjs` builds, serves on :8181, and starts the Firebase emulators for `accounts.spec.mjs`; Java 21+). `tests/e2e/helpers.mjs` has the fixtures: every page fails its test on any page error; `mockAI` answers api.anthropic.com; `fakeBrowserTranslator` stands in for Chrome's Translator; `useAccounts` points the site at the emulators.
- Nothing in the tests may touch the network. New feature → add a spec; changed UI text that a test asserts → update the test.
- Dependencies: tests need only `devDependencies`. `optionalDependencies` are for `npm run vendor:*`.
