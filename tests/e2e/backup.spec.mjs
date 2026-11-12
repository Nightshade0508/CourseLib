import { readFileSync } from 'node:fs';
import { test, expect, openApp, mockAI, signInAI, pasteArticle, waitTranslated } from './helpers.mjs';

test('a backup file restores documents and settings in a fresh browser, and never contains the AI key', async ({ page, browser }, testInfo) => {
  await signInAI(page);
  await mockAI(page);
  await openApp(page);
  await pasteArticle(page, 'A short paragraph.\n\nAnother short one.', { title: 'Backup Me' });
  await waitTranslated(page, 2);
  await page.click('#typoopen');
  await page.click('#ty-ff [data-v="sans"]');
  await page.keyboard.press('Escape');

  const download = page.waitForEvent('download');
  await page.click('#moremenu');
  await page.locator('.pop-item', { hasText: '导出备份' }).click();
  const file = testInfo.outputPath('backup.json');
  await (await download).saveAs(file);
  const raw = readFileSync(file, 'utf8');
  const backup = JSON.parse(raw);
  expect(backup.db.filter((r) => r.path.startsWith('docs/')).map((r) => r.data.title)).toEqual(['Backup Me']);
  expect(raw).not.toContain('sk-ant');

  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.route(/fonts\./, (r) => r.fulfill({ status: 200, body: '' }));
  await p2.goto('./');
  await expect(p2.locator('#newbtn')).toBeVisible();
  await p2.keyboard.press('Control+k');
  await p2.keyboard.type('恢复');
  await p2.keyboard.press('Enter');
  await p2.locator('#modal input[type=file]').setInputFiles(file);
  await p2.locator('#modal select').selectOption('replace');
  await p2.locator('#modal .btn.primary').click();
  await expect(p2.locator('#modal .ferr')).toBeVisible();        // replacing asks twice
  await p2.locator('#modal .btn.primary').click();
  await expect(p2.locator('.navitem .ni-t', { hasText: 'Backup Me' })).toHaveCount(1);
  await expect(p2.locator('body')).toHaveClass(/ff-sans/);
  await ctx.close();
});
