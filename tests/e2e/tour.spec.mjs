// A walk through the less-travelled corners of the page. Its job is to catch code that only breaks when it
// runs: the fixture fails the test on any page error, so each click here is a check.
import { test, expect, openApp, mockAI, signInAI, pasteArticle, waitTranslated, en } from './helpers.mjs';

test('every panel, view and menu opens without errors', async ({ page }) => {
  await signInAI(page);
  await mockAI(page);
  await openApp(page);
  await pasteArticle(page, 'First Heading\n\nObjectivity means intersubjectivity in the first place. It is a long story.\n\nSecond Heading\n\nA second paragraph follows here with some more words in it.', { title: 'Tour' });
  await waitTranslated(page, 2);

  // language switch and themes
  for (const l of ['en', 'zh', 'blur', 'both']) await page.click(`#langseg [data-lang="${l}"]`);
  await page.click('#typoopen');
  for (const t of ['dark', 'light', 'system']) await page.click(`#themeseg [data-theme="${t}"]`);
  await page.click('#ty-al [data-v="off"]');
  await page.click('#ty-al [data-v="on"]');
  await page.click('#ty-reset');
  await page.keyboard.press('Escape');

  // listening: the player opens, the voice-pack panel lists its downloads, both close again
  await page.click('#ttsopen');
  await expect(page.locator('#player')).toBeVisible();
  await page.click('#pllang [data-l="zh"]');
  await page.click('#pllang [data-l="en"]');
  await page.click('#plsettings');
  await expect(page.locator('#vpbody')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.click('#plclose');
  await expect(page.locator('#player')).toBeHidden();

  // study card and an AI explanation of a selection
  await page.locator('#userdoc .da-study').click();
  await expect(page.locator('#userdoc')).toContainText('Study Card');
  await en(page).first().evaluate((el) => {
    const t = el.firstChild, r = document.createRange();
    r.setStart(t, 0); r.setEnd(t, 30);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await expect(page.locator('#selbar')).toBeVisible();
  await page.locator('#selbar [data-ai="explain"]').click();
  await expect(page.locator('.aicard')).toContainText('这是一个测试回答');
  await page.keyboard.press('Escape');

  // views
  for (const [name, text] of [['首页', '三步开始'], ['我的标注', '标注'], ['生词本', '生词']]) {
    await page.keyboard.press('Control+k');
    await page.keyboard.type(name);
    await page.keyboard.press('Enter');
    await expect(page.locator('#viewpane')).toContainText(text);
  }

  // search finds the document's text and leads back to it
  await page.keyboard.press('Control+k');
  await page.keyboard.type('intersubjectivity');
  await expect(page.locator('.cmdk-it').first()).toBeVisible();
  await page.keyboard.press('Escape');

  // document menu: rename, then delete
  const row = page.locator('#nav li', { hasText: 'Tour' });
  await row.locator('.navitem').click();
  await row.locator('.row-btn').click();
  const items = await page.locator('.pop .pop-item').allInnerTexts();
  expect(items.join(' ')).toContain('重命名');
  await page.locator('.pop-item', { hasText: '重命名' }).click();
  await page.locator('#f-title').fill('Tour Renamed');
  await page.locator('#modal .btn.primary').click();
  await expect(page.locator('.navitem', { hasText: 'Tour Renamed' })).toHaveCount(1);
  await page.locator('#nav li', { hasText: 'Tour Renamed' }).locator('.row-btn').click();
  await page.locator('.pop-item', { hasText: '删除' }).click();
  const confirm = page.locator('#modal .btn.primary, #modal .btn.danger');
  if (await confirm.count()) await confirm.first().click();
  await expect(page.locator('.navitem', { hasText: 'Tour Renamed' })).toHaveCount(0);

  // about and the outline rail
  await page.click('#moremenu');
  await page.locator('.pop-item', { hasText: '关于' }).click();
  await expect(page.locator('#modal')).toContainText('Kokoro');
  await page.keyboard.press('Escape');
});
