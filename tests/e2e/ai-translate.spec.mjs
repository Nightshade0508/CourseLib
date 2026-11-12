import { test, expect, openApp, mockAI, signInAI, pasteArticle, zh, waitTranslated } from './helpers.mjs';

test.beforeEach(async ({ page }) => { await signInAI(page); });

test('a short pasted article is named and translated with the visitor\'s AI account', async ({ page }) => {
  const calls = await mockAI(page);
  await openApp(page);
  await expect(page.locator('#acct')).toContainText('Anthropic');
  await pasteArticle(page, 'The first paragraph of a test essay about reading.\n\nThe second paragraph continues the argument with more words.\n\nA third paragraph ends it.');
  await waitTranslated(page, 3);
  await expect(zh(page)).toHaveText(['【译】The first pa', '【译】The second p', '【译】A third para']);
  await expect(page.locator('#userdoc .dt')).toHaveText('Test Essay');

  // naming uses the cheaper quick model at low effort; translation uses the main model; the key goes straight to Anthropic
  const naming = calls.find((c) => /"title": "\.\.\."/.test(c.prompt));
  const translating = calls.find((c) => /Blocks:\n/.test(c.prompt));
  expect(naming.model).toBe('claude-haiku-5-5');
  expect(naming.effort).toEqual({ effort: 'low' });
  expect(translating.model).toBe('claude-opus-5-5');
  expect(translating.key).toBe('sk-ant-test-123');

  // it is saved in this browser
  await page.reload();
  await expect(page.locator('.navitem', { hasText: 'Test Essay' })).toHaveCount(1);
  await expect(zh(page).first()).toHaveText('【译】The first pa');
});

test('a long article waits with a cost estimate, can switch to the quick model, then translates', async ({ page }) => {
  const calls = await mockAI(page, { title: { title: 'Long Essay', zh: '长文', author: 'T' } });
  await openApp(page);
  const para = 'This is a sentence in a long academic essay about objectivity and the authority of numbers in public life. ';
  const long = Array.from({ length: 12 }, (_, i) => para.repeat(5) + 'Paragraph ' + i + '.').join('\n\n');
  await pasteArticle(page, long);

  const stat = page.locator('#pdfstat');
  await expect(stat).toContainText('预计');
  await expect(stat.locator('.btn.primary')).toBeVisible();
  expect(calls.some((c) => /Blocks:\n/.test(c.prompt)), 'nothing is translated before the visitor confirms').toBe(false);

  const before = await stat.innerText();
  await stat.locator('.lnk').first().click();           // switch to the quick model
  await expect(stat).not.toHaveText(before);
  await stat.locator('.btn.primary').click();
  await waitTranslated(page, 12);
  expect(calls.filter((c) => /Blocks:\n/.test(c.prompt)).every((c) => c.model === 'claude-haiku-5-5')).toBe(true);
  await expect(stat).toBeHidden();
});

test('runtime: sample() streams text and parses JSON; db keeps Firestore-like documents', async ({ page }) => {
  await mockAI(page);
  await openApp(page);
  const r = await page.evaluate(async () => {
    const s = await window.claude.use('sample');
    const deltas = [];
    const a = await s('Say hi', { onText: (u) => deltas.push(u.delta) });
    const j = await s.json('Dictionary lookup for "cat"', { modelTier: 'quick' });
    const db = await window.claude.use('db');
    const seen = [];
    const un = db.collection('t').onSnapshot((snap) => seen.push(snap.docs.map((d) => d.id).join(',')));
    await db.doc('t/a').set({ x: 1 });
    await db.doc('t/b').set({ x: 2 });
    await db.doc('t/a').update({ y: 3 });
    const g = await db.doc('t/a').get();
    let missing = 'none';
    try { await db.doc('t/zzz').update({ a: 1 }); } catch (e) { missing = e.code; }
    await db.doc('t/b').delete();
    await new Promise((res) => setTimeout(res, 200));
    un();
    const sub = await db.collection('pdf/doc1/chunks').get();
    return { text: a.text, streamed: deltas.join(''), json: j, a: g.data(), exists: g.exists, missing, last: seen.at(-1), sub: sub.size };
  });
  expect(r.text).toBe('这是一个测试回答。');
  expect(r.streamed).toBe(r.text);
  expect(r.json.zh).toBe('猫');
  expect(r.a).toEqual({ x: 1, y: 3 });
  expect(r.exists).toBe(true);
  expect(r.missing).toBe('not_found');
  expect(r.last).toBe('a');
  expect(r.sub).toBe(0);
});

test('asking for AI while signed out opens the account dialog instead of failing silently', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.route(/fonts\./, (r) => r.fulfill({ status: 200, body: '' }));
  await page.goto('./');
  await expect(page.locator('#newbtn')).toBeVisible();
  const code = await page.evaluate(() => window.claude.use('sample').then((s) => s('hi')).then(() => 'ok', (e) => e.code));
  expect(code).toBe('not_signed_in');
  await expect(page.locator('.mtitle', { hasText: 'AI 账号' })).toBeVisible();
  await ctx.close();
});
