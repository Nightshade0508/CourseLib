// The sync engine against an in-memory "cloud" and in-memory devices that follow the same contract as the
// real IndexedDB store and Firestore adapter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSync, utf8Length, PAGE, MAX_BYTES } from '../../public/runtime/lib/sync-core.js';

function makeCloud() {
  const log = [];                       // every write, in commit order: {seq, path, data, del, m, by}
  let seq = 0;
  return {
    log,
    failNext: 0,
    remoteFor(device) {
      const cloud = this;
      return {
        pulls: 0, pushes: 0,
        async pull(cursor, max) {
          this.pulls++;
          const latest = new Map();     // like Firestore: one document per path, ordered by its last write
          for (const w of log) latest.set(w.path, w);
          const rows = [...latest.values()].sort((a, b) => a.seq - b.seq).filter((w) => w.seq > (cursor || 0));
          const page = rows.slice(0, max);
          return { changes: page.map((w) => structuredClone(w)), cursor: page.length ? page.at(-1).seq : cursor || 0, more: rows.length > max };
        },
        async push(records) {
          this.pushes++;
          if (cloud.failNext) { cloud.failNext--; throw new Error('network'); }
          for (const r of records) log.push({ seq: ++seq, path: r.path, data: structuredClone(r.data), del: !!r.del, m: r.m, by: device });
        },
      };
    },
  };
}
function makeDevice(cloud, name) {
  const docs = new Map(), outbox = new Map();
  let cur = null, clock = 0;
  const local = {
    device: name,
    async cursor() { return cur; },
    async setCursor(c) { cur = c; },
    async dirty() { return [...outbox.values()].map((e) => ({ ...e })); },
    async read(paths) { const out = {}; for (const p of paths) if (docs.has(p)) out[p] = structuredClone(docs.get(p)); return out; },
    async apply(changes) {
      let n = 0;
      for (const c of changes) {
        const e = outbox.get(c.path);
        if (e && e.m > c.m) continue;
        if (c.del) docs.delete(c.path); else docs.set(c.path, structuredClone(c.data));
        outbox.delete(c.path); n++;
      }
      return n;
    },
    async settle(sent) { for (const s of sent) { const e = outbox.get(s.path); if (e && e.m === s.m) outbox.delete(s.path); } },
  };
  const states = [];
  const remote = cloud.remoteFor(name);
  const sync = createSync({ local, remote, onState: (s) => states.push(s) });
  return {
    docs, outbox, states, remote, sync,
    set(path, data, at) { docs.set(path, data); outbox.set(path, { path, m: at ?? ++clock }); },
    del(path, at) { docs.delete(path); outbox.set(path, { path, m: at ?? ++clock, del: true }); },
    all() { return Object.fromEntries([...docs.entries()].sort()); },
  };
}

test('what one device writes reaches the other, deletions included', async () => {
  const cloud = makeCloud(), a = makeDevice(cloud, 'A'), b = makeDevice(cloud, 'B');
  a.set('docs/essay', { title: 'Essay' }, 10);
  a.set('pdf/essay/chunks/c0000', { items: [{ en: 'Hello', zh: '你好' }] }, 11);
  const s = await a.sync.run();
  assert.deepEqual([s.pulled, s.pushed, s.pending], [0, 2, 0]);
  assert.equal(a.outbox.size, 0);
  assert.equal((await b.sync.run()).pulled, 2);
  assert.deepEqual(b.all(), a.all());

  b.del('docs/essay', 20);
  await b.sync.run();
  await a.sync.run();
  assert.deepEqual(Object.keys(a.all()), ['pdf/essay/chunks/c0000']);
});

test('a device does not re-apply its own uploads', async () => {
  const cloud = makeCloud(), a = makeDevice(cloud, 'A');
  a.set('vocab/cat', { zh: '猫' }, 5);
  await a.sync.run();
  const again = await a.sync.run();
  assert.deepEqual([again.pulled, again.pushed], [0, 0]);
});

test('when both devices edit the same record, the later edit wins on both', async () => {
  const cloud = makeCloud(), a = makeDevice(cloud, 'A'), b = makeDevice(cloud, 'B');
  a.set('marks/m1', { c: 'y' }, 100);
  await a.sync.run(); await b.sync.run();

  a.set('marks/m1', { c: 'green-from-A' }, 200);      // A edits first …
  b.set('marks/m1', { c: 'blue-from-B' }, 300);       // … B edits later, both offline
  await a.sync.run();                                  // A uploads its edit
  await b.sync.run();                                  // B sees A's older edit, keeps its own and uploads it
  assert.deepEqual(b.docs.get('marks/m1'), { c: 'blue-from-B' });
  await a.sync.run();
  assert.deepEqual(a.docs.get('marks/m1'), { c: 'blue-from-B' });

  // the other order: the device that syncs second made the earlier edit, so it gives way
  a.set('marks/m1', { c: 'early-A' }, 400);
  b.set('marks/m1', { c: 'late-B' }, 500);
  await b.sync.run();
  await a.sync.run();
  assert.deepEqual(a.docs.get('marks/m1'), { c: 'late-B' });
  assert.equal(a.outbox.size, 0);
});

test('a deletion and a later edit: the later one wins', async () => {
  const cloud = makeCloud(), a = makeDevice(cloud, 'A'), b = makeDevice(cloud, 'B');
  a.set('docs/x', { v: 1 }, 1);
  await a.sync.run(); await b.sync.run();
  a.del('docs/x', 10);
  b.set('docs/x', { v: 2 }, 20);
  await a.sync.run(); await b.sync.run(); await a.sync.run();
  assert.deepEqual(a.docs.get('docs/x'), { v: 2 });
  assert.deepEqual(b.docs.get('docs/x'), { v: 2 });
});

test('a record edited again while it is being uploaded stays in the outbox', async () => {
  const cloud = makeCloud(), a = makeDevice(cloud, 'A'), b = makeDevice(cloud, 'B');
  a.set('docs/x', { v: 1 }, 1);
  const realPush = a.remote.push.bind(a.remote);
  a.remote.push = async (records) => { a.set('docs/x', { v: 2 }, 2); return realPush(records); };   // an edit lands mid-upload
  const s = await a.sync.run();
  assert.equal(s.pending, 1);
  a.remote.push = realPush;
  await a.sync.run();
  await b.sync.run();
  assert.deepEqual(b.docs.get('docs/x'), { v: 2 });
});

test('a new device catches up page by page', async () => {
  const cloud = makeCloud(), a = makeDevice(cloud, 'A'), b = makeDevice(cloud, 'B');
  const n = PAGE * 2 + 17;
  for (let i = 0; i < n; i++) a.set('vocab/w' + i, { i }, i + 1);
  assert.equal((await a.sync.run()).pushed, n);
  assert.ok(a.remote.pushes >= Math.ceil(n / 100));
  assert.equal((await b.sync.run()).pulled, n);
  assert.equal(b.remote.pulls, 3);
  assert.equal(b.docs.size, n);
});

test('a failed upload keeps the outbox, reports an error, and the next run finishes the job', async () => {
  const cloud = makeCloud(), a = makeDevice(cloud, 'A'), b = makeDevice(cloud, 'B');
  a.set('docs/x', { v: 1 }, 1);
  cloud.failNext = 1;
  await assert.rejects(a.sync.run(), /network/);
  assert.equal(a.states.at(-1).phase, 'error');
  assert.equal(a.outbox.size, 1);
  await a.sync.run();
  assert.equal(a.states.at(-1).phase, 'idle');
  await b.sync.run();
  assert.deepEqual(b.docs.get('docs/x'), { v: 1 });
});

test('a record too large for the cloud is skipped and reported, without blocking the rest', async () => {
  const cloud = makeCloud(), a = makeDevice(cloud, 'A'), b = makeDevice(cloud, 'B');
  a.set('docs/huge', { body: '汉'.repeat(Math.ceil(MAX_BYTES / 3) + 10) }, 1);
  a.set('docs/small', { body: 'ok' }, 2);
  const s = await a.sync.run();
  assert.deepEqual(s.skipped, ['docs/huge']);
  assert.equal(s.tooBig, 1);
  assert.equal(s.pending, 0);
  await b.sync.run();
  assert.deepEqual(Object.keys(b.all()), ['docs/small']);
  assert.equal((await a.sync.run()).skipped.length, 0);          // not retried until it changes
});

test('calls made during a sync are folded into one follow-up run', async () => {
  const cloud = makeCloud(), a = makeDevice(cloud, 'A');
  a.set('docs/x', { v: 1 }, 1);
  const first = a.sync.run();
  a.set('docs/y', { v: 1 }, 2);
  const second = a.sync.run(), third = a.sync.run();
  assert.equal(first, second); assert.equal(second, third);
  await first;
  assert.equal(a.outbox.size, 0);
  assert.equal(cloud.log.length, 2);
});

test('utf8Length counts bytes, not characters', () => {
  assert.equal(utf8Length('abc'), 3);
  assert.equal(utf8Length('é'), 2);
  assert.equal(utf8Length('汉字'), 6);
  assert.equal(utf8Length('😀'), 4);
  for (const s of ['naïve 汉字 😀 ok', '“quotes” — dash']) assert.equal(utf8Length(s), Buffer.byteLength(s));
});
