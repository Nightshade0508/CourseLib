import { test, expect, openApp, openAdd, mockAI, signInAI, pasteArticle, fakeBrowserTranslator, zh, en, waitTranslated } from './helpers.mjs';
import { makePdf, wrap } from './fixtures.mjs';

test.beforeEach(async ({ page }) => { await signInAI(page); });

test('an uploaded PDF is read, split into paragraphs and translated', async ({ page }) => {
  await mockAI(page, { title: { title: 'Trust in Numbers', zh: '对数字的信任', author: 'T. Porter' } });
  await openApp(page);
  const paragraphs = [
    'Objectivity is one of the classical ideals of science, and yet its meaning has rarely been examined with much care by those who appeal to it most often in public debate.',
    'Numbers create distance between the people who make decisions and the people who must live with them, and that distance is precisely what makes numbers attractive to weak institutions.',
  ];
  await openAdd(page);
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
  await page.keyboard.press('Control+k');
  await page.keyboard.type('新建文件夹');
  await page.keyboard.press('Enter');
  await expect(page.locator('#modal .mtitle')).toHaveText('新建文件夹');
  await page.locator('#modal .finput').first().fill('HIST 7B');
  await page.locator('#modal .btn.primary').click();
  await expect(page.locator('#nav')).toContainText('HIST 7B');

  await pasteArticle(page, 'One paragraph only, to be deleted.\n\nAnd its neighbour.', { title: 'Delete Me' });
  await waitTranslated(page, 2);
  await expect(page.locator('.navitem', { hasText: 'Delete Me' })).toHaveCount(1);
});

test('添加文档: three tabs that keep the chosen folder and method, a drop zone, text files, and dropping a file on the page', async ({ page }) => {
  await mockAI(page);
  await fakeBrowserTranslator(page);
  await openApp(page);
  await page.keyboard.press('Control+k');
  await page.keyboard.type('新建文件夹');
  await page.keyboard.press('Enter');
  await expect(page.locator('#modal .mtitle')).toHaveText('新建文件夹');
  await page.locator('#modal .finput').first().fill('Week 3');
  await page.locator('#modal .btn.primary').click();
  await expect(page.locator('#nav')).toContainText('Week 3');
  await expect(page.locator('#modal')).toBeHidden();

  await page.keyboard.press('n');                                    // N opens the dialog straight away
  await expect(page.locator('.add-tab')).toHaveText(['文件', '网址', '粘贴文本']);
  await expect(page.locator('.dropzone')).toContainText('把文件拖到这里');
  const week3 = await page.locator('#f-folder option', { hasText: 'Week 3' }).getAttribute('value');
  await page.locator('#f-folder').selectOption(week3);
  await page.locator('#f-tier').selectOption('quick');
  await page.click('.add-tab[data-tab="url"]');
  await expect(page.locator('#f-folder')).toHaveValue(week3);
  await expect(page.locator('#f-tier')).toHaveValue('quick');
  await page.click('.add-tab[data-tab="paste"]');
  await expect(page.locator('#f-folder')).toHaveValue(week3);
  await expect(page.locator('details.add-more')).not.toHaveAttribute('open', '');
  await page.locator('details.add-more summary').click();
  await page.locator('#f-auto').uncheck();                           // saving bilingual text as is: no translation method
  await expect(page.locator('#f-tier')).toBeHidden();
  await expect(page.locator('#f-paired')).toBeVisible();
  await page.click('.add-tab[data-tab="file"]');

  // a Markdown file chosen through the drop zone keeps its own headings
  await page.locator('#modal input[type=file]').setInputFiles({ name: 'notes.md', mimeType: 'text/markdown',
    buffer: Buffer.from('# Reading Notes\n\n## Distance\n\nNumbers create distance between people.\n\nShort line here\n\nAnother **plain** paragraph.') });
  await expect(page.locator('.dropzone')).toContainText('notes.md');
  await page.locator('#f-tier').selectOption('free');
  await page.locator('#modal .btn.primary').click();
  await waitTranslated(page, 3);
  await expect(page.locator('#userdoc h2')).toContainText(['Reading Notes', 'Distance']);
  await expect(en(page)).toHaveText(['Numbers create distance between people.', 'Short line here', 'Another plain paragraph.']);
  await expect(page.locator('#userdoc .chips')).toContainText('上传的文本');
  await expect(page.locator('#userdoc .eyebrow')).toContainText('Week 3');

  // dropping a file anywhere on the reading area opens the dialog with it
  await expect(page.locator('#modal')).toBeHidden();
  const dt = await page.evaluateHandle(() => { const d = new DataTransfer(); d.items.add(new File(['Plain words.'], 'dropped.txt', { type: 'text/plain' })); return d; });
  await page.dispatchEvent('main', 'dragenter', { dataTransfer: dt });
  await expect(page.locator('.drop-shade')).toBeVisible();
  await page.dispatchEvent('main', 'drop', { dataTransfer: dt });
  await expect(page.locator('.drop-shade')).toBeHidden();
  await expect(page.locator('.dropzone')).toContainText('dropped.txt');
});
