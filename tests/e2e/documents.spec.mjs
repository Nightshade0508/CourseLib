import { test, expect, openApp, mockAI, signInAI, pasteArticle, zh, en, waitTranslated } from './helpers.mjs';
import { makePdf, wrap } from './fixtures.mjs';

test.beforeEach(async ({ page }) => { await signInAI(page); });

test('an uploaded PDF is read, split into paragraphs and translated', async ({ page }) => {
  await mockAI(page, { title: { title: 'Trust in Numbers', zh: '对数字的信任', author: 'T. Porter' } });
  await openApp(page);
  const paragraphs = [
    'Objectivity is one of the classical ideals of science, and yet its meaning has rarely been examined with much care by those who appeal to it most often in public debate.',
    'Numbers create distance between the people who make decisions and the people who must live with them, and that distance is precisely what makes numbers attractive to weak institutions.',
  ];
  await page.click('#newbtn');
  await page.locator('.pop-item', { hasText: '上传 PDF / Word' }).click();
  await page.locator('#modal input[type=file]').setInputFiles({ name: 'porter-trust.pdf', mimeType: 'application/pdf', buffer: makePdf(wrap(paragraphs)) });
  await page.locator('#f-tier').selectOption('default');
  await page.locator('#modal .btn.primary').click();
  const start = page.locator('#pdfstat .btn.primary');
  await Promise.race([start.waitFor({ state: 'visible' }).then(() => start.click()), waitTranslated(page, 1)]).catch(() => {});
  await waitTranslated(page, 1);
  await expect(page.locator('#userdoc .dt')).toHaveText('Trust in Numbers');
  const text = (await en(page).allInnerTexts()).join(' ');
  expect(text).toContain('Objectivity is one of the classical ideals of science');
  expect(text).toContain('attractive to weak institutions');
  await expect(zh(page).first()).toContainText('【译】');
});

test('highlights survive a reload and show up under 我的标注', async ({ page }) => {
  await mockAI(page);
  await openApp(page);
  await pasteArticle(page, 'Objectivity means intersubjectivity in the first place.\n\nA second paragraph follows here.', { title: 'Marks' });
  await waitTranslated(page, 2);
  await en(page).first().evaluate((el) => {
    const t = el.firstChild, r = document.createRange();
    r.setStart(t, 0); r.setEnd(t, 'Objectivity'.length);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    document.dispatchEvent(new Event('selectionchange'));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await expect(page.locator('#selbar')).toBeVisible();
  await page.locator('#selbar .sw.c-y').click();
  await expect(page.locator('#userdoc mark.an.c-y')).toHaveText('Objectivity');
  // the write to the browser database is asynchronous: let it land before reloading
  await expect.poll(() => page.evaluate(async () => (await (await window.claude.use('db')).collection('marks').get()).size)).toBe(1);

  await page.reload();
  await expect(page.locator('#userdoc mark.an.c-y')).toHaveText('Objectivity');
  await page.keyboard.press('Control+k');
  await page.keyboard.type('我的标注');
  await page.keyboard.press('Enter');
  await expect(page.locator('#viewpane')).toContainText('Objectivity');
});

test('double-clicking a word looks it up and adds it to 生词本', async ({ page }) => {
  await mockAI(page);
  await openApp(page);
  await pasteArticle(page, 'The cat sat quietly on the warm windowsill.\n\nA second paragraph follows here.', { title: 'Words' });
  await waitTranslated(page, 2);
  await en(page).first().evaluate((el) => {
    const t = el.firstChild, i = t.textContent.indexOf('cat'), r = document.createRange();
    r.setStart(t, i); r.setEnd(t, i + 3);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  });
  const card = page.locator('.aicard');
  await expect(card).toContainText('猫');
  await card.getByText('加入生词本').click();
  await expect(card).toContainText('已加入');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+k');
  await page.keyboard.type('生词本');
  await page.keyboard.press('Enter');
  await expect(page.locator('#viewpane')).toContainText('cat');
  await expect(page.locator('#viewpane')).toContainText('猫');
});

test('folders can be created and documents deleted', async ({ page }) => {
  await mockAI(page);
  await openApp(page);
  await page.click('#newbtn');
  await page.locator('.pop-item', { hasText: '新建文件夹' }).click();
  await page.locator('#modal .finput').first().fill('HIST 7B');
  await page.locator('#modal .btn.primary').click();
  await expect(page.locator('#nav')).toContainText('HIST 7B');

  await pasteArticle(page, 'One paragraph only, to be deleted.\n\nAnd its neighbour.', { title: 'Delete Me' });
  await waitTranslated(page, 2);
  await expect(page.locator('.navitem', { hasText: 'Delete Me' })).toHaveCount(1);
});
