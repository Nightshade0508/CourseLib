// Static checks on the app's ES modules (public/app, public/runtime), so a slip that would only blow up
// when some rarely used code path runs is caught here instead:
//   - every file parses as a module
//   - every imported name is exported by the file it is imported from
//   - no file uses a name that is neither declared, imported, nor a browser global
//   - no file assigns to an imported name (imports are read-only; use the exported setter)
//   - the app's files, and the runtime's, each form one load-order chain (see public/app/main.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import { analyze } from 'eslint-scope';
import globals from 'globals';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../public');
const KNOWN = new Set([...Object.keys(globals.browser), ...Object.keys(globals.es2021), 'Highlight', 'Translator', 'PTL', 'LanguageDetector']);

function walkDir(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walkDir(p) : /\.js$/.test(f) ? [p] : [];
  });
}
const files = [...walkDir(path.join(PUBLIC, 'app')), ...walkDir(path.join(PUBLIC, 'runtime'))];
const rel = (f) => path.relative(PUBLIC, f);

const mods = new Map();
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'module', ranges: true, locations: true });
  const exports = new Set(), imports = [];
  for (const n of ast.body) {
    if (n.type === 'ImportDeclaration') imports.push({ from: n.source.value, names: n.specifiers.map((s) => (s.type === 'ImportSpecifier' ? s.imported.name : s.type === 'ImportDefaultSpecifier' ? 'default' : '*')), line: n.loc.start.line });
    if (n.type === 'ExportNamedDeclaration') {
      if (n.declaration) {
        if (n.declaration.id) exports.add(n.declaration.id.name);
        else for (const d of n.declaration.declarations) exports.add(d.id.name);
      }
      for (const s of n.specifiers) exports.add(s.exported.name);
    }
    if (n.type === 'ExportDefaultDeclaration') exports.add('default');
  }
  mods.set(f, { src, ast, exports, imports });
}

test('every imported name exists in the file it comes from', () => {
  const bad = [];
  for (const [f, m] of mods) for (const im of m.imports) {
    if (!im.from.startsWith('.')) { bad.push(`${rel(f)}:${im.line} imports a non-relative module "${im.from}"`); continue; }
    const target = path.resolve(path.dirname(f), im.from);
    const t = mods.get(target);
    if (!t) { try { statSync(target); } catch { bad.push(`${rel(f)}:${im.line} imports missing file ${im.from}`); } continue; }
    for (const n of im.names) if (n !== '*' && !t.exports.has(n)) bad.push(`${rel(f)}:${im.line} imports { ${n} } but ${rel(target)} does not export it`);
  }
  assert.deepEqual(bad, []);
});

test('no undeclared names and no assignment to imports', () => {
  const bad = [];
  for (const [f, m] of mods) {
    const sm = analyze(m.ast, { ecmaVersion: 2022, sourceType: 'module' });
    for (const r of sm.globalScope.through) {
      const n = r.identifier.name;
      if (!KNOWN.has(n)) bad.push(`${rel(f)}:${r.identifier.loc.start.line} uses "${n}", which is not declared or imported`);
      else if (r.isWrite()) bad.push(`${rel(f)}:${r.identifier.loc.start.line} assigns to the global "${n}"`);
    }
    const moduleScope = sm.globalScope.childScopes[0];
    for (const v of moduleScope.variables) {
      if (!v.defs.some((d) => d.type === 'ImportBinding')) continue;
      for (const r of v.references) if (r.isWrite()) bad.push(`${rel(f)}:${r.identifier.loc.start.line} assigns to "${v.name}", which is imported (use its setter)`);
    }
  }
  assert.deepEqual(bad, []);
});

// Files that do work as soon as they load run in a fixed order: each one's first import is the file before it
// (see public/app/main.js). Every file of the folder must be on that chain; pure helpers live in lib/.
for (const [dir, last, entry, least] of [['app', 'boot.js', ['main.js'], 40], ['runtime', 'main.js', ['mt-worker.js'], 12]]) {
  test(`the ${dir} files form one load-order chain that ends in ${last}`, () => {
    const folder = path.join(PUBLIC, dir);
    const chained = new Set();
    let cur = path.join(folder, last);
    for (;;) {
      assert.ok(mods.has(cur), `${rel(cur)} is part of the chain but does not exist`);
      assert.ok(!chained.has(cur), `${rel(cur)} appears twice in the chain`);
      chained.add(cur);
      const first = mods.get(cur).ast.body[0];
      if (!first || first.type !== 'ImportDeclaration' || first.specifiers.length) break;       // util.js: the start of the chain
      cur = path.resolve(path.dirname(cur), first.source.value);
    }
    const outside = readdirSync(folder).filter((f) => /\.js$/.test(f) && !entry.includes(f)).map((f) => path.join(folder, f)).filter((f) => !chained.has(f));
    assert.deepEqual(outside.map(rel), [], `files in public/${dir}/ that are not in the chain (pure helpers belong in public/${dir}/lib/)`);
    assert.ok(chained.size >= least);
  });
}
