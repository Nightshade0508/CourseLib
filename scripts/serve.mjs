// Minimal static server for dist/ (no dependencies). Usage: node scripts/serve.mjs [port] [--emulators]
// --emulators: answer /config.js with settings that point accounts and sync at the local Firebase emulators
// (start them with `npm run emulators`), for trying accounts without a real Firebase project.
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dist = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'dist');
const args = process.argv.slice(2);
const port = Number(args.find((a) => /^\d+$/.test(a)) || process.env.PORT || 8080);
const EMULATOR_CONFIG = args.includes('--emulators')
  ? "window.PTL_CONFIG={firebase:{apiKey:'demo-key',authDomain:'demo-ptl.firebaseapp.com',projectId:'demo-ptl',appId:'demo'},emulators:{auth:'http://127.0.0.1:9099',firestore:'127.0.0.1:8787'}};"
  : null;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png' };

createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  if (EMULATOR_CONFIG && p === '/config.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(EMULATOR_CONFIG); return; }
  const file = path.join(dist, path.normalize(p));
  if (!file.startsWith(dist)) { res.writeHead(403).end(); return; }
  try {
    const s = await stat(file);
    if (!s.isFile()) throw 0;
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Content-Length': s.size });
    createReadStream(file).pipe(res);
  } catch { res.writeHead(404).end('Not found'); }
}).listen(port, () => console.log(`http://localhost:${port}`));
