import { test, expect, openApp, fakeBrowserTranslator, pasteArticle, waitTranslated } from './helpers.mjs';

async function addDoc(page, title) {
  await pasteArticle(page, `${title} opens with a sentence about numbers.\n\nA second paragraph follows.`, { title });
  await waitTranslated(page, 2);
}

test('文库 shows every document by folder, filters, sorts, switches layout and stays current', async ({ page }) => {
  await fakeBrowserTranslator(page);
  await openApp(page);
  await page.click('.tool-item:has-text("文库")');
  await expect(page.locator('.lib-empty')).toContainText('文库还是空的');

  for (const t of ['Objectivity and Authority', 'Panopticism', 'Seeing Like a State']) await addDoc(page, t);
  await page.keyboard.press('Control+k');
  await page.keyboard.type('新建文件夹');
  await page.keyboard.press('Enter');
  await expect(page.locator('#modal .mtitle')).toHaveText('新建文件夹');
  await page.locator('#modal .finput').first().fill('HIST 7B');
  await page.locator('#modal .btn.primary').click();
  await expect(page.locator('#modal')).toBeHidden();

  await page.click('.tool-item:has-text("文库")');
  await expect(page.locator('#viewpane .dz')).toHaveText('共 3 篇读物');
  await expect(page.locator('.lib-chip')).toHaveText([/全部\s*3/, /我的读物\s*3/, /HIST 7B\s*0/]);
  await expect(page.locator('.lib-group[data-folder="mine"] .lib-t')).toHaveCount(3);
  await expect(page.locator('.lib-group').nth(1)).toContainText('这个文件夹还是空的');

  // filter by text, then by folder
  await page.fill('#lib-q', 'panopt');
  await expect(page.locator('.lib-t')).toHaveText(['Panopticism']);
  await page.fill('#lib-q', '');
  await page.click('.lib-chip[data-folder="mine"]');
  await expect(page.locator('.lib-gh')).toHaveCount(0);
  await expect(page.locator('.lib-t')).toHaveCount(3);
  await page.click('.lib-chip[data-folder="all"]');

  // sort by title; list layout; both remembered
  await page.selectOption('#lib-sort', 'title');
  await expect(page.locator('.lib-group[data-folder="mine"] .lib-t')).toHaveText(['Objectivity and Authority', 'Panopticism', 'Seeing Like a State']);
  await page.click('.lib-layout [data-layout="list"]');
  await expect(page.locator('.lib-body')).toHaveClass(/as-list/);
  await page.reload();
  await page.click('.tool-item:has-text("文库")');
  await expect(page.locator('#lib-sort')).toHaveValue('title');
  await expect(page.locator('.lib-body')).toHaveClass(/as-list/);

  // the ⋯ menu moves a document; the page redraws by itself
  await page.locator('.lib-item', { hasText: 'Panopticism' }).locator('.lib-more').click();
  await page.locator('.pop-item', { hasText: '移动到' }).click();
  const hist = await page.locator('#modal select option', { hasText: 'HIST 7B' }).getAttribute('value');
  await page.locator('#modal select').selectOption(hist);
  await page.locator('#modal .btn.primary').click();
  await expect(page.locator('.lib-group').nth(1).locator('.lib-t')).toHaveText(['Panopticism']);
  await expect(page.locator('.lib-chip[data-folder="mine"]')).toContainText('2');

  // a card opens its document; 添加文档 from an empty folder pre-selects that folder
  await page.locator('.lib-open', { hasText: 'Seeing Like a State' }).click();
  await expect(page.locator('#userdoc .dt')).toHaveText('Seeing Like a State');
  await page.click('.tool-item:has-text("文库")');
  await page.click('.lib-chip[data-folder="all"]');
  await page.locator('.lib-group').nth(1).locator('.lib-fmenu').click();
  await expect(page.locator('.pop-item')).toContainText(['重命名']);
  await page.keyboard.press('Escape');
});

test('文库 fits a phone screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fakeBrowserTranslator(page);
  await openApp(page);
  await addDoc(page, 'A Rather Long Title About Objectivity, Authority and the Numbers of Public Life');
  await page.keyboard.press('Control+k');
  await page.keyboard.type('文库');
  await page.keyboard.press('Enter');
  await expect(page.locator('.lib-item')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
