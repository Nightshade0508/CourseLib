import { test, expect, openApp } from './helpers.mjs';

test('the site loads signed out, with its menus and no errors', async ({ page }) => {
  await openApp(page);
  await expect(page).toHaveTitle(/Parallel Text Library/);
  await expect(page.locator('#acct')).toContainText('未登录');

  await page.click('#newbtn');
  await expect(page.locator('.pop .pop-item')).toContainText(['上传 PDF / Word', '粘贴文章', '新建文件夹']);
  await page.keyboard.press('Escape');

  await page.click('#moremenu');
  const more = (await page.locator('.pop .pop-item').allInnerTexts()).join(' ');
  expect(more).toContain('导出备份');
  expect(more).toContain('从备份恢复');
  await page.keyboard.press('Escape');

  await page.keyboard.press('?');
  await expect(page.locator('#modal .mtitle')).toHaveText('键盘快捷键');
  await page.keyboard.press('Escape');
});

test('the command palette finds views and runs commands', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('Control+k');
  await expect(page.locator('.cmdk-g').first()).toBeVisible();
  await page.keyboard.type('生词');
  await expect(page.locator('.cmdk-it b').first()).toContainText('生词');
  await page.keyboard.press('Enter');
  await expect(page.locator('#viewpane .dt')).toContainText('生词');
});

test('the phone layout has no sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.keyboard.press('Control+k');
  await expect(page.locator('.cmdk-g').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
