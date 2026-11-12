import { test, expect, openApp, mockAI, signInAI, pasteArticle, waitTranslated } from './helpers.mjs';

// One Chinese sentence per English sentence, so sentence alignment has something exact to find.
function sentences(en) {
  const out = [];
  for (const piece of en.split(/(?<=[.!?])\s+/)) {
    if (out.length && /(?:Dr|Mr|Mrs|e\.g|i\.e)\.$/.test(out[out.length - 1])) out[out.length - 1] += ' ' + piece;
    else out.push(piece);
  }
  return out;
}
const bySentence = (en) => sentences(en).map((s, k) => '第' + (k + 1) + '句译文' + s.slice(0, 4) + '。').join('');

const easy = 'The man walked to the old house near the river. He opened the door and looked inside.';
const hard = 'The epistemological ramifications of panopticism reconfigure hermeneutic praxis and disciplinary subjectivation.';
const first = 'Objectivity means, first of all, intersubjectivity. Dr. Smith argued, e.g. in 1958, that numbers matter. Recent sociologists have extended his conclusions.';

async function openLearningDoc(page, extraEasy = 24) {
  await signInAI(page);
  await mockAI(page, { translate: bySentence });
  await openApp(page);
  await pasteArticle(page, [first, hard].concat(Array.from({ length: extraEasy }, () => easy)).join('\n\n'), { title: 'Learning Test' });
  const start = page.locator('#pdfstat .btn.primary');
  await Promise.race([start.waitFor({ state: 'visible' }).then(() => start.click()), waitTranslated(page, extraEasy + 2)]).catch(() => {});
  await waitTranslated(page, extraEasy + 2);
}

async function hoverWord(page, sel, word) {
  const pt = await page.locator(sel).first().evaluate((el, w) => {
    const t = el.firstChild, i = t.textContent.indexOf(w), r = document.createRange();
    r.setStart(t, i); r.setEnd(t, i + w.length);
    const q = r.getBoundingClientRect();
    return { x: q.left + q.width / 2, y: q.top + q.height / 2 };
  }, word);
  const read = () => page.evaluate(() => { const h = CSS.highlights.get('align'); return h ? [...h].map((r) => r.toString()) : null; });
  // the page may still be settling after the last paragraph arrives: nudge the pointer until the highlight shows
  for (let k = 0; k < 10; k++) {
    await page.mouse.move(pt.x + (k % 2), pt.y);
    await page.waitForTimeout(150);
    const got = await read();
    if (got && got.some((x) => x.includes(word))) return got;
  }
  return read();
}

test('reading settings apply, persist across reloads, and reset', async ({ page }) => {
  await signInAI(page);
  await mockAI(page);
  await openApp(page);
  await pasteArticle(page, 'A short paragraph.\n\nAnother short one.');
  await waitTranslated(page, 2);

  await page.click('#typoopen');
  await page.click('[data-fs="1"]');
  await page.click('[data-fs="1"]');
  await page.click('#ty-lh [data-v="relaxed"]');
  await page.click('#ty-w [data-v="wide"]');
  await page.click('#ty-ff [data-v="sans"]');
  const zoom = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--read-zoom').trim());
  expect(await zoom()).toBe('1.16');
  await expect(page.locator('body')).toHaveClass(/lh-relaxed/);
  await expect(page.locator('body')).toHaveClass(/ff-sans/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#typo')).toBeHidden();

  await page.reload();
  await expect(page.locator('#newbtn')).toBeVisible();
  expect(await zoom()).toBe('1.16');
  await expect(page.locator('body')).toHaveClass(/ff-sans/);

  // focus mode: F hides the sidebar, Esc brings it back
  await page.keyboard.press('f');
  await expect(page.locator('body')).toHaveClass(/focus/);
  await expect(page.locator('.side')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('body')).not.toHaveClass(/focus/);
});

test('hovering a sentence highlights its translation, in both directions and at larger text sizes', async ({ page }) => {
  await openLearningDoc(page, 2);
  expect(await hoverWord(page, '#userdoc p.en', 'numbers')).toEqual(['Dr. Smith argued, e.g. in 1958, that numbers matter.', '第2句译文Dr. 。']);
  expect((await hoverWord(page, '#userdoc p.en', 'sociologists'))[1]).toContain('第3句');
  expect((await hoverWord(page, '#userdoc p.zh', '第1句'))[0]).toBe('Objectivity means, first of all, intersubjectivity.');
  await page.mouse.move(1300, 500);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => CSS.highlights.has('align'))).toBe(false);

  await page.click('#typoopen');
  await page.click('[data-fs="1"]');
  await page.click('[data-fs="1"]');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  expect((await hoverWord(page, '#userdoc p.en', 'sociologists'))[1]).toContain('第3句');
});

test('learning mode hides only easy paragraphs, underlines unknown words, keeps statistics and adapts the level', async ({ page }) => {
  await openLearningDoc(page);
  await page.evaluate(() => localStorage.setItem('ptl:learn-stats', JSON.stringify({ days: {}, win: { e: 19, r: 0 } })));
  await page.reload();
  await expect(page.locator('#userdoc .pair').first()).toBeVisible();

  await page.click('#langseg [data-lang="blur"]');
  await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('#userdoc .pair p.zh')].slice(0, 4).map((z) => z.classList.contains('ez'))))
    .toEqual([false, false, true, true]);                       // dense paragraphs keep their Chinese
  const filters = await page.evaluate(() => { const z = [...document.querySelectorAll('#userdoc .pair p.zh')]; return [getComputedStyle(z[1]).filter, getComputedStyle(z[2]).filter]; });
  expect(filters[0]).toBe('none');
  expect(filters[1]).toContain('blur');
  await expect.poll(() => page.evaluate(() => { const h = CSS.highlights.get('unk'); return h ? [...h].map((r) => r.toString()) : []; }))
    .toEqual(expect.arrayContaining(['epistemological', 'panopticism', 'hermeneutic']));

  await page.click('#typoopen');
  await expect(page.locator('#ty-vl')).toHaveText(/8,?000/);
  await page.keyboard.press('Escape');

  // read on: each paragraph stays on screen long enough to count, then scrolls past
  for (let i = 0; i < 8; i++) {
    await page.evaluate((k) => { const el = document.querySelectorAll('#userdoc .pair')[k]; window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 300); }, i);
    await page.waitForTimeout(1600);
  }
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect.poll(() => page.evaluate(() => +localStorage.getItem('ptl:vlevel'))).toBe(9000);   // 20 hidden paragraphs read without peeking
  await page.click('#typoopen');
  await expect(page.locator('#ty-vl')).toHaveText(/9,?000/);
  await expect(page.locator('#ty-stat')).toContainText('本周');
});
