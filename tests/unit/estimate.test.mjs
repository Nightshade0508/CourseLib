import test from 'node:test';
import assert from 'node:assert/strict';
import { translationSize } from '../../public/app/lib/estimate.js';

test('nothing to translate → no estimate', () => {
  assert.equal(translationSize([]), null);
});

test('size grows with the text and counts one batch per ~4,200 characters', () => {
  const para = { en: 'x'.repeat(1000) };
  const one = translationSize([para]);
  assert.deepEqual(one, { words: 172, inTok: 250 + 12 + 900, outTok: 500 + 14 + 80 });
  const ten = translationSize(Array(10).fill(para));
  assert.equal(ten.inTok, 2500 + 120 + 3 * 900);          // 10,000 characters → 3 batches
  assert.ok(ten.outTok > one.outTok * 9);
});
