import test from 'node:test';
import assert from 'node:assert/strict';
import { splitEn, splitZh, alignLens, alignSentences } from '../../public/app/lib/sentences.js';

const cut = (t, segs) => segs.map((s) => t.slice(s[0], s[1]));

test('English: abbreviations, initials and quotes do not end a sentence', () => {
  const t = 'Objectivity means, first of all, intersubjectivity. Dr. Smith argued, e.g. in 1958, that numbers matter. "Is that so?" asked J. R. Porter. It is.';
  assert.deepEqual(cut(t, splitEn(t)), [
    'Objectivity means, first of all, intersubjectivity.',
    'Dr. Smith argued, e.g. in 1958, that numbers matter.',
    '"Is that so?" asked J. R. Porter.',       // a quoted question followed by lower case continues the sentence
    'It is.',
  ]);
});

test('English: text without a final full stop is still one sentence', () => {
  assert.deepEqual(cut('A heading without a stop', splitEn('A heading without a stop')), ['A heading without a stop']);
  assert.deepEqual(splitEn(''), []);
});

test('Chinese: full-width stops, closing quotes and ellipses', () => {
  const t = '客观性首先意味着主体间性。他问道：“真的吗？”然后离开了！最后……';
  assert.deepEqual(cut(t, splitZh(t)), ['客观性首先意味着主体间性。', '他问道：“真的吗？”', '然后离开了！', '最后……']);
});

test('alignment pairs sentences one to one when lengths agree', () => {
  const beads = alignLens([50, 120, 30], [20, 48, 12]);
  assert.deepEqual(beads, [{ en: [0, 1], zh: [0, 1] }, { en: [1, 2], zh: [1, 2] }, { en: [2, 3], zh: [2, 3] }]);
});

test('alignment merges when the translation joins two sentences into one', () => {
  const beads = alignLens([60, 62, 40], [50, 16]);
  assert.deepEqual(beads, [{ en: [0, 2], zh: [0, 1] }, { en: [2, 3], zh: [1, 2] }]);
});

test('Latin names inside the Chinese do not throw the alignment off', () => {
  const en = 'Porter wrote about trust. The Corps of Engineers and the Bureau of Reclamation fought over cost-benefit analysis for decades.';
  const zh = '波特写的是信任。陆军工程兵团（Corps of Engineers）和垦务局（Bureau of Reclamation）为成本效益分析争了几十年。';
  const a = alignSentences(en, zh);
  assert.equal(a.es.length, 2);
  assert.equal(a.zs.length, 2);
  assert.deepEqual(a.beads, [{ en: [0, 1], zh: [0, 1] }, { en: [1, 2], zh: [1, 2] }]);
});

test('every sentence ends up in exactly one bead', () => {
  const a = alignSentences('One. Two is a bit longer than one. Three! Four?', '一。二比一长一些，而且合并了三！四？');
  assert.equal(a.beads.at(-1).en[1], a.es.length);
  assert.equal(a.beads.at(-1).zh[1], a.zs.length);
  a.beads.reduce((prev, b) => { assert.equal(b.en[0], prev.en[1]); assert.equal(b.zh[0], prev.zh[1]); return b; }, { en: [0, 0], zh: [0, 0] });
});
