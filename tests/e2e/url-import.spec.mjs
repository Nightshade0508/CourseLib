import { test, expect, openApp, openAdd, mockAI, signInAI, fakeBrowserTranslator, zh, en, waitTranslated } from './helpers.mjs';
import { makePng } from './fixtures.mjs';

const ARTICLE = {
  title: 'How Numbers Earn Trust - Example Review',
  url: 'https://review.example.org/numbers-trust',
  metadata: { 'og:site_name': 'Example Review', author: 'T. Porter' },
  content: [
    '# How Numbers Earn Trust',
    '[![Image 1: A ledger](https://img.example.org/ledger.png)](https://review.example.org/ledger)',
    'Objectivity is one of the classical ideals of science, and yet its meaning has **rarely** been examined with much care by [those who appeal to it](https://review.example.org/who).',
    '## Distance',
    'Numbers create distance between the people who make decisions and the people who must live with them.[\\[1\\]](#cite_note-1)',
    '![Image 2](https://img.example.org/missing.png)',
    'That distance is precisely what makes numbers attractive to institutions that cannot rely on trust alone, and it explains a great deal about modern public life.',
  ].join('\n\n'),
};

// The reader service and the picture hosts, answered locally.
async function mockReader(page, answer = { status: 200, body: { code: 200, status: 20000, data: ARTICLE } }) {
  const seen = [];
  await page.route('https://r.jina.ai/**', (route) => {
    seen.push({ url: route.request().url(), accept: route.request().headers().accept });
    route.fulfill({ status: answer.status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(answer.body) });
  });
  await page.route('https://img.example.org/**', (route) => {
    if (route.request().url().includes('missing')) return route.fulfill({ status: 404, body: '' });
    route.fulfill({ status: 200, contentType: 'image/png', body: makePng(240, 160) });
  });
  return seen;
}
async function openUrlDialog(page) {
  await openAdd(page, 'url');
}

test('an article is imported from its address with pictures, translated for free, and links back to its page', async ({ page }) => {
  page.allowErrors(/Failed to load resource.*404/);                         // the article's second picture is gone on purpose
  await fakeBrowserTranslator(page);
  const seen = await mockReader(page);
  await openApp(page);
  await openUrlDialog(page);
  await expect(page.locator('#f-images')).toBeChecked();
  await page.locator('#f-url').fill('review.example.org/numbers-trust');     // the scheme is optional
  await page.locator('#modal .btn.primary').click();
  await waitTranslated(page, 3);

  expect(seen[0].url).toBe('https://r.jina.ai/https://review.example.org/numbers-trust');
  expect(seen[0].accept).toBe('application/json');
  await expect(page.locator('#userdoc .dt')).toHaveText('How Numbers Earn Trust');
  await expect(page.locator('#userdoc .dz')).toHaveText('【免】How Numbers Earn Trust');
  await expect(page.locator('#userdoc .dauth')).toHaveText('T. Porter');
  await expect(page.locator('#userdoc .chips')).toContainText('网页文章');
  const link = page.locator('#userdoc .chip-link');
  await expect(link).toHaveAttribute('href', 'https://review.example.org/numbers-trust');
  await expect(link).toHaveAttribute('rel', /noopener/);

  // Markdown is gone from the text; headings are headings; the citation marker is dropped
  await expect(en(page)).toHaveText([
    'Objectivity is one of the classical ideals of science, and yet its meaning has rarely been examined with much care by those who appeal to it.',
    'Numbers create distance between the people who make decisions and the people who must live with them.',
    'That distance is precisely what makes numbers attractive to institutions that cannot rely on trust alone, and it explains a great deal about modern public life.',
  ]);
  await expect(page.locator('#userdoc h2')).toContainText(['Distance']);
  await expect(zh(page).first()).toContainText('【免】Objectivity');

  // the picture that loads is shown, the one that fails leaves no hole, and neither is sent anywhere with a referrer
  const figs = page.locator('#userdoc figure.fig');
  await expect(figs).toHaveCount(2);
  await expect(figs.first().locator('img')).toHaveAttribute('referrerpolicy', 'no-referrer');
  await expect(figs.first().locator('img')).toHaveAttribute('alt', 'A ledger');
  await expect(figs.first()).toBeVisible();
  await expect(figs.nth(1)).toBeHidden();

  // it is all still there after a reload
  await page.reload();
  await expect(page.locator('#userdoc figure.fig').first()).toBeVisible();
  await expect(en(page)).toHaveCount(3);
});

test('pictures are left out when the box is unticked, and the choice is remembered', async ({ page }) => {
  await fakeBrowserTranslator(page);
  await mockReader(page);
  await openApp(page);
  await openUrlDialog(page);
  await page.locator('#f-images').uncheck();
  await page.locator('#f-url').fill('https://review.example.org/numbers-trust');
  await page.locator('#modal .btn.primary').click();
  await waitTranslated(page, 3);
  await expect(page.locator('#userdoc figure.fig')).toHaveCount(0);
  await expect(en(page)).toHaveCount(3);
  await openUrlDialog(page);
  await expect(page.locator('#f-images')).not.toBeChecked();
});

test('with an AI account the page title goes into the naming step and the text is translated by AI', async ({ page }) => {
  page.allowErrors(/Failed to load resource.*404/);
  await signInAI(page);
  const calls = await mockAI(page, { title: { title: 'Trust in Numbers (Porter)', zh: '对数字的信任', author: 'Theodore Porter' } });
  await mockReader(page);
  await openApp(page);
  await page.keyboard.press('Control+k');
  await page.keyboard.type('添加文档 · 网址');
  await page.keyboard.press('Enter');
  await page.locator('#f-url').fill('https://review.example.org/numbers-trust');
  await page.locator('#modal .btn.primary').click();
  await waitTranslated(page, 3);
  await expect(page.locator('#userdoc .dt')).toHaveText('Trust in Numbers (Porter)');
  await expect(page.locator('#userdoc .dz')).toHaveText('对数字的信任');
  expect(calls.find((c) => /"title": "\.\.\."/.test(c.prompt)).prompt).toContain('How Numbers Earn Trust');
  await expect(zh(page).first()).toContainText('【译】Objectivity');
});

test('pages that cannot be read explain why and leave the dialog open', async ({ page }) => {
  await openApp(page);
  const err = page.locator('#modal .ferr');
  const cases = [
    [{ status: 200, body: { code: 200, data: { title: 'Page Not Found', url: 'https://x.example.org/gone', content: 'Sorry.', warning: 'Target URL returned error 404: Not Found', httpStatus: 404 } } }, '打不开（错误 404）'],
    [{ status: 403, body: { code: 403, name: 'AbuseAlleviationError', message: 'Anonymous access to domain blocked' } }, '不允许自动读取'],
    [{ status: 422, body: { code: 422, message: "Domain 'nope.example' could not be resolved" } }, '网址打不开'],
    [{ status: 429, body: { code: 429, message: 'Rate limit' } }, '一分钟后再试'],
    [{ status: 200, body: { code: 200, data: { title: 'Sign in', url: 'https://x.example.org/wall', content: 'Please sign in to continue.' } } }, '没有从这个网页读到正文'],
    [{ status: 200, body: { code: 200, data: { title: '客观性', url: 'https://x.example.cn/a', content: '客观性是一种价值。'.repeat(40) } } }, '不是英文'],
  ];
  page.allowErrors(/Failed to load resource/);
  for (const [answer, message] of cases) {
    await page.unroute('https://r.jina.ai/**');
    await mockReader(page, answer);
    if (await page.locator('#modal').isHidden()) await openUrlDialog(page);
    await page.locator('#f-url').fill('https://x.example.org/whatever');
    await page.locator('#modal .btn.primary').click();
    await expect(err).toContainText(message);
    await expect(page.locator('#modal .btn.primary')).toBeEnabled();
  }
  await page.locator('#f-url').fill('not an address');
  await page.locator('#modal .btn.primary').click();
  await expect(err).toContainText('完整的网址');
  await expect(page.locator('.navitem')).toHaveCount(0);                    // nothing half-made was added to the library
});

test('pasting only a web address into 粘贴文本 switches to importing that page', async ({ page }) => {
  await fakeBrowserTranslator(page);
  await mockReader(page);
  await openApp(page);
  await openAdd(page, 'paste');
  await page.locator('#f-body').fill('https://review.example.org/numbers-trust');
  await page.locator('#modal .btn.primary').click();
  await expect(page.locator('.add-tab.on')).toHaveAttribute('data-tab', 'url');
  await expect(page.locator('#f-url')).toHaveValue('https://review.example.org/numbers-trust');
});
