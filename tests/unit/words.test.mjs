import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { wordRank, scanWords, isHardParagraph } from '../../public/app/lib/words.js';

const list = readFileSync(new URL('../../public/data/en-words.txt', import.meta.url), 'utf8').split('\n').filter(Boolean);
const words = new Map(list.map((w, i) => [w, i + 1]));

test('the word list is 40,000 forms, most common first', () => {
  assert.equal(list.length, 40000);
  assert.equal(wordRank(words, 'the'), 1);
  assert.ok(wordRank(words, 'house') < 1000);
});

test('inflected forms fall back to their base form; nonsense ranks Infinity', () => {
  const small = new Map([['study', 10], ['make', 20], ['quick', 30], ['box', 40]]);
  assert.equal(wordRank(small, 'studies'), 10);
  assert.equal(wordRank(small, 'making'), 20);
  assert.equal(wordRank(small, 'quickly'), 30);
  assert.equal(wordRank(small, 'boxes'), 40);
  assert.equal(wordRank(small, 'zxqv'), Infinity);
});

test('academic terms rank beyond an 8,000-word vocabulary, everyday words inside it', () => {
  for (const w of ['epistemological', 'panopticism', 'hermeneutic']) assert.ok(wordRank(words, w) > 8000, w);
  for (const w of ['walked', 'river', 'opened', 'door']) assert.ok(wordRank(words, w) <= 8000, w);
});

test('scanWords counts words and reports where the unknown ones are, flagging sentence starts', () => {
  const t = 'Foucault describes panopticism. Surveillance follows.';
  const seen = [];
  const r = scanWords(t, (w, initial) => { seen.push([w, initial]); return w === 'panopticism'; });
  assert.equal(r.words, 5);
  assert.deepEqual(r.unk.map((u) => t.slice(u[0], u[1])), ['panopticism']);
  assert.deepEqual(seen.filter((x) => x[1]).map((x) => x[0]), ['Foucault', 'Surveillance']);
});

test('a paragraph is hard with two obstacles, or one unknown word when it is very short', () => {
  assert.equal(isHardParagraph(0, 50, 0), false);
  assert.equal(isHardParagraph(1, 50, 0), false);
  assert.equal(isHardParagraph(2, 50, 0), true);
  assert.equal(isHardParagraph(1, 50, 1), true);
  assert.equal(isHardParagraph(1, 10, 0), true);
});
