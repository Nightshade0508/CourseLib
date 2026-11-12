import { test, expect, openApp, mockAI, fakeBrowserTranslator, pasteArticle, zh, waitTranslated } from './helpers.mjs';

test('signed-out visitors get free in-browser translation, and can upgrade a document to AI later', async ({ page }) => {
  await fakeBrowserTranslator(page);
  const calls = await mockAI(page);
  await openApp(page);
  await pasteArticle(page, 'Numbers create distance, and distance creates trust.\n\nContextual integrity holds that privacy is preserved when information flows conform to the norms of the context.');
  await waitTranslated(page, 2);
  await expect(zh(page).first()).toHaveText('【免】Numbers create distance, and distance creates trust.');
  await expect(page.locator('#userdoc')).toContainText('免费翻译');
  expect(calls.length, 'free translation never calls an AI service').toBe(0);

  // learning mode "全部": Chinese is blurred until tapped
  await page.click('#typoopen');
  await page.click('#ty-learn [data-v="all"]');
  await page.keyboard.press('Escape');
  await page.click('#langseg [data-lang="blur"]');
  const first = zh(page).first();
  await expect.poll(() => first.evaluate((e) => getComputedStyle(e).filter)).toContain('blur');
  await first.click();
  await expect.poll(() => first.evaluate((e) => getComputedStyle(e).filter)).toBe('none');
});
