// Shared fixtures for the browser tests.
//  - every page blocks web fonts and fails the test on any uncaught page error or console error
//  - mockAI(): answers api.anthropic.com the way the app's prompts expect (title, translation, lookup)
//  - fakeBrowserTranslator(): stands in for Chrome's built-in Translator so free translation needs no model
import { test as base, expect } from '@playwright/test';

export { expect };

export const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    page.allowErrors = (re) => { page._allowed = re; };
    await use(page);
    const bad = errors.filter((e) => !(page._allowed && page._allowed.test(e)));
    expect(bad, 'the page logged errors').toEqual([]);
  },
});

function sse(text) {
  const ev = (t, d) => `event: ${t}\ndata: ${JSON.stringify(d)}\n\n`;
  const chunks = text.match(/[\s\S]{1,40}/g) || [''];
  return ev('message_start', { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 1 } } }) +
    ev('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }) +
    chunks.map((c) => ev('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: c } })).join('') +
    ev('content_block_stop', { type: 'content_block_stop', index: 0 }) +
    ev('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 7 } }) +
    ev('message_stop', { type: 'message_stop' });
}

// Default translation: "【译】" + the first words of the English, so tests can tell which block was translated.
// opts.translate(en) overrides it; opts.title sets the generated library entry.
export async function mockAI(page, opts = {}) {
  const calls = [];
  const translate = opts.translate || ((en) => '【译】' + en.slice(0, 12));
  await page.route('https://api.anthropic.com/**', async (route) => {
    const req = route.request();
    if (req.url().includes('/v1/models/')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'claude-opus-5-5', type: 'model' }) });
    const body = JSON.parse(req.postData());
    const h = req.headers();
    const prompt = body.messages[0].content.at(-1).text;
    calls.push({ model: body.model, prompt, effort: body.output_config, key: h['x-api-key'], betas: h['anthropic-beta'], fallbacks: body.fallbacks });
    let text = '这是一个测试回答。';
    if (/"title": "\.\.\.", "zh"/.test(prompt)) text = JSON.stringify(opts.title || { title: 'Test Essay', zh: '测试文章', author: 'A. Tester' });
    else if (/Blocks:\n/.test(prompt)) {
      const blocks = prompt.split('Blocks:\n')[1].split('\n').filter(Boolean).map((l) => JSON.parse(l));
      text = blocks.map((b) => JSON.stringify({ i: b.i, zh: translate(b.t) })).join('\n') + '\n{"glossary":[["test","测试"]]}';
    } else if (/Dictionary lookup/.test(prompt)) text = '{"lemma":"cat","pos":"noun","ipa":"/kæt/","def":"a small animal","zh":"猫","note":""}';
    await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: sse(text) });
  });
  return calls;
}

// Sign in with an Anthropic key (stored only in this browser profile), before the app loads.
export async function signInAI(page) {
  await page.addInitScript(() => {
    if (!localStorage.getItem('ptl-account')) localStorage.setItem('ptl-account', JSON.stringify({ provider: 'anthropic', key: 'sk-ant-test-123', model: 'claude-opus-5-5', quickModel: 'claude-haiku-5-5' }));
  });
}

// Chrome's Translator API, faked: "【免】" + the English text.
export async function fakeBrowserTranslator(page) {
  await page.addInitScript(() => {
    self.Translator = {
      availability: async () => 'available',
      create: async () => ({ translate: async (t) => '【免】' + t }),
    };
  });
}

export async function openApp(page) {
  await page.goto('./');
  await expect(page.locator('#newbtn')).toBeVisible();
  await page.waitForFunction(() => !!document.querySelector('#acct') && document.querySelector('#acct').textContent.trim().length > 0);
}

// "新建 → 粘贴文章" with automatic translation.
export async function pasteArticle(page, text, { title } = {}) {
  await page.click('#newbtn');
  await page.locator('.pop-item', { hasText: '粘贴文章' }).click();
  await expect(page.locator('#modal .mtitle')).toHaveText('添加文档');
  if (title) await page.locator('#f-title').fill(title);
  await page.locator('#f-auto').check();
  await page.locator('#f-body').fill(text);
  await page.locator('#modal .btn.primary').click();
}

export const zh = (page) => page.locator('#userdoc p.zh');
export const en = (page) => page.locator('#userdoc p.en');

// Wait until every paragraph of the open document has a translation.
export async function waitTranslated(page, min = 1) {
  await page.waitForFunction((n) => {
    const z = [...document.querySelectorAll('#userdoc p.zh')];
    return z.length >= n && z.every((x) => x.textContent.trim());
  }, min, { timeout: 45_000 });
}
