// 找资料 with every catalogue and full-text host answered locally. Response shapes follow what each service
// returned when probed; the content is made up.
import { test, expect, openApp, openAdd, fakeBrowserTranslator, mockAI, signInAI, en, zh, waitTranslated } from './helpers.mjs';
import { makePdf, wrap } from './fixtures.mjs';

const filler = (n, s) => Array.from({ length: n }, (_, i) => `${s} sentence number ${i + 1} keeps the chapter long enough to count.`).join(' ');
const BOOK_MD = ['### or, the Modern Example', '## by Ada Writer', '* * *',
  '## [](https://www.gutenberg.org/x)Letter 1', filler(60, 'The first letter'),
  '## [](https://www.gutenberg.org/x)Chapter 1', filler(70, 'The first chapter'),
  '## [](https://www.gutenberg.org/x)Chapter 2', filler(80, 'The second chapter')].join('\n\n');
const ATOM = `<?xml version='1.0'?><feed xmlns="http://www.w3.org/2005/Atom"><entry><id>http://arxiv.org/abs/2401.00001v2</id>
  <published>2024-01-02T00:00:00Z</published><title>Numbers and Trust in Public Science</title><summary>We study how numbers earn trust.</summary>
  <author><name>Rosa Example</name></author><author><name>Li Sample</name></author></entry></feed>`;
const PAPER_MD = '# Numbers and Trust in Public Science\n\n## Abstract\n\nWe study how numbers earn trust in public life and why institutions rely on them.\n\n## 1 Introduction\n\n' + filler(8, 'The introduction');
const OPENALEX = { results: [
  { id: 'https://openalex.org/W1', doi: 'https://doi.org/10.1234/open.5', display_name: 'Open Numbers in Policy', publication_year: 2021, cited_by_count: 40, language: 'en',
    authorships: [{ author: { display_name: 'Mia Open' } }], primary_location: { source: { display_name: 'Journal of Examples' }, landing_page_url: 'https://journal.example.org/5' },
    open_access: { is_oa: true }, best_oa_location: { pdf_url: 'https://repo.example.edu/open.pdf', landing_page_url: 'https://repo.example.edu/open', license: 'cc-by', version: 'publishedVersion' },
    abstract_inverted_index: { Open: [0], numbers: [1], matter: [2] } },
  { id: 'https://openalex.org/W2', doi: 'https://doi.org/10.1234/paid.6', display_name: 'Paywalled Numbers', publication_year: 2019, cited_by_count: 900, language: 'en',
    authorships: [{ author: { display_name: 'Pat Closed' } }], primary_location: { source: { display_name: 'Closed Review' }, landing_page_url: 'https://closed.example.com/6' }, open_access: { is_oa: false } },
] };
const GUTENDEX = { count: 1, results: [{ id: 99901, title: 'An Example; or, The Modern Example', authors: [{ name: 'Writer, Ada', birth_year: 1800, death_year: 1870 }], languages: ['en'], copyright: false, download_count: 5000,
  formats: { 'text/html': 'https://www.gutenberg.org/ebooks/99901.html.images' } }] };
const OPENLIB = { docs: [
  { key: '/works/OL1W', title: 'An Example; or, The Modern Example', author_name: ['Ada Writer'], first_publish_year: 1818, ebook_access: 'public', ia: ['examplescan01'], language: ['eng'], edition_count: 300 },
  { key: '/works/OL2W', title: 'Example Returns', author_name: ['Modern Author'], first_publish_year: 2005, ebook_access: 'borrowable', ia: ['x'], language: ['eng'] },
  { key: '/works/OL3W', title: 'Old Example Scan', author_name: ['Sam Scanner'], first_publish_year: 1850, ebook_access: 'public', ia: ['oldscan01'], language: ['eng'] },
] };
const OCR = ['THE  OLD  EXAMPLE', 'CHAPTER  I.', filler(40, 'Scanned first'), 'OLD EXAMPLE', '12', 'CHAPTER  II.', filler(45, 'Scanned second')].join('\n\n');

async function mockSources(page, { openalex = 200 } = {}) {
  const calls = [];
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  await page.route('https://api.openalex.org/**', (r) => { calls.push(r.request().url()); return openalex === 429 ? json(r, { error: 'Rate limit exceeded' }, 429) : json(r, OPENALEX); });
  await page.route('https://gutendex.com/**', (r) => { calls.push(r.request().url()); return json(r, GUTENDEX); });
  await page.route('https://openlibrary.org/**', (r) => { calls.push(r.request().url()); return json(r, OPENLIB); });
  await page.route('https://archive.org/**', (r) => {
    const u = r.request().url(); calls.push(u);
    if (u.includes('/metadata/oldscan01')) return json(r, { metadata: { title: 'Old Example Scan', language: 'eng' }, files: [{ name: 'oldscan01_djvu.txt' }, { name: 'oldscan01.pdf' }] });
    if (u.includes('/download/oldscan01/')) return r.fulfill({ status: 200, contentType: 'text/plain', headers: { 'access-control-allow-origin': '*' }, body: OCR });
    return json(r, {}, 404);
  });
  await page.route('https://repo.example.edu/**', (r) => { calls.push(r.request().url());
    return r.fulfill({ status: 200, contentType: 'application/pdf', headers: { 'access-control-allow-origin': '*' }, body: makePdf(wrap([filler(6, 'The open paper')])) }); });
  await page.route('https://r.jina.ai/**', (r) => {
    const u = decodeURIComponent(r.request().url()); calls.push(u);
    if (u.includes('export.arxiv.org/api/query')) return json(r, { code: 200, data: { title: 'arXiv Query', html: ATOM } });
    if (u.includes('arxiv.org/html/2401.00001')) return json(r, { code: 200, data: { title: 'Numbers and Trust in Public Science', url: 'https://arxiv.org/html/2401.00001', content: PAPER_MD } });
    if (u.includes('gutenberg.org/cache/epub/99901/')) return json(r, { code: 200, data: { title: 'An Example', url: u, content: BOOK_MD } });
    return json(r, { code: 422, message: 'unexpected ' + u }, 422);
  });
  return calls;
}
async function search(page, q, kind) {
  await openAdd(page, 'find');
  if (kind) await page.selectOption('#f-kind', kind);
  await page.fill('#f-q', q);
  await page.click('#modal .btn.primary');
  await expect(page.locator('.find-status')).toContainText('找到', { timeout: 20_000 });
}
const item = (page, title) => page.locator('.find-item', { has: page.locator('.find-t', { hasText: title }) });

test.beforeEach(async ({ page }) => { await fakeBrowserTranslator(page); });

test('one search covers books and papers; only open full texts get an import button', async ({ page }) => {
  const calls = await mockSources(page);
  await openApp(page);
  await search(page, 'example numbers');
  expect(calls.some((u) => u.startsWith('https://api.openalex.org/works?search=example%20numbers'))).toBe(true);
  expect(calls.some((u) => u.includes('export.arxiv.org/api/query?search_query=all:"example numbers"'))).toBe(true);

  const book = item(page, 'An Example; or, The Modern Example');
  await expect(book).toHaveCount(1);                                          // Gutenberg + Open Library merged
  await expect(book.locator('.find-meta')).toContainText('Gutenberg · Open Library');
  await expect(book.locator('[data-import]')).toHaveText('选择章节…');
  await expect(item(page, 'Numbers and Trust in Public Science').locator('[data-import]')).toHaveText('导入并翻译');
  await expect(item(page, 'Open Numbers in Policy').locator('.find-lic')).toHaveText('CC BY');

  const lent = item(page, 'Example Returns');
  await expect(lent.locator('[data-import]')).toHaveCount(0);
  await expect(lent.locator('.find-why')).toContainText('借阅');
  await expect(lent.locator('a.btn')).toHaveAttribute('href', 'https://openlibrary.org/works/OL2W');
  const paid = item(page, 'Paywalled Numbers');
  await expect(paid.locator('.find-why')).toHaveText('需要订阅或付费');
  await expect(paid.locator('a.btn')).toHaveAttribute('href', 'https://doi.org/10.1234/paid.6');

  // 只找书 asks only the book catalogues
  calls.length = 0;
  await page.selectOption('#f-kind', 'book');
  await page.click('#modal .btn.primary');
  await expect(page.locator('.find-status')).toContainText('找到');
  expect(calls.some((u) => /openalex|arxiv/.test(u))).toBe(false);
  await expect(page.locator('.find-kind', { hasText: '论文' })).toHaveCount(0);
});

test('a book is imported one chapter per document, in a new folder; only the first starts translating', async ({ page }) => {
  await mockSources(page);
  await openApp(page);
  await search(page, 'an example', 'book');
  await item(page, 'An Example; or, The Modern Example').locator('[data-import]').click();
  await expect(page.locator('.find-cht')).toHaveText(['Letter 1', 'Chapter 1', 'Chapter 2']);
  await expect(page.locator('#f-folder')).toBeHidden();                       // books get their own folder
  await page.click('.find-pick [data-all="1"]');
  await page.locator('[data-ch="1"]').uncheck();
  await expect(page.locator('.find-sum')).toContainText('已选 2 部分');
  await expect(page.locator('#modal .btn.primary')).toHaveText('导入 2 篇');
  await page.click('#modal .btn.primary');

  await waitTranslated(page, 3);
  await expect(page.locator('#userdoc .dt')).toHaveText('An Example · Letter 1');
  await expect(page.locator('#userdoc .eyebrow')).toContainText('An Example');
  await expect(page.locator('#userdoc .chips')).toContainText('公版书');
  await expect(page.locator('#userdoc .chip-link')).toHaveAttribute('href', 'https://www.gutenberg.org/ebooks/99901');
  await expect(en(page).first()).toContainText('The first letter sentence number 1');
  await expect(zh(page).first()).toContainText('【免】');
  const nav = page.locator('#nav .folder', { hasText: 'An Example' });
  await expect(nav.locator('.navitem .ni-t')).toHaveText(['An Example · Letter 1', 'An Example · Chapter 2']);
  await expect(nav.locator('.navitem', { hasText: 'Chapter 2' })).toContainText('待翻译');

  // the second chapter waits for its own 开始翻译
  await nav.locator('.navitem', { hasText: 'Chapter 2' }).click();
  await expect(page.locator('#pdfstat .btn.primary')).toBeVisible();
  await expect(zh(page).first()).toHaveText('');
  await page.locator('#pdfstat .btn.primary').click();
  await waitTranslated(page, 3);

  // the citation comes from the catalogue, not from AI
  const meta = await page.evaluate(async () => { const db = await window.claude.use('db'); return (await db.collection('docs').get()).docs.map((d) => d.data()); });
  expect(meta.every((d) => /Writer, Ada\. <i>An Example; or, The Modern Example<\/i>\. 1818\. Project Gutenberg, www\.gutenberg\.org\/ebooks\/99901\./.test(d.mla))).toBe(true);
  expect(meta.every((d) => d.citeA === 'Writer' && d.renamed === true)).toBe(true);
});

test('a scanned book from the Internet Archive is read from its OCR text', async ({ page }) => {
  await mockSources(page);
  await openApp(page);
  await search(page, 'old example scan', 'book');
  const scan = item(page, 'Old Example Scan');
  await expect(scan.locator('.find-note')).toContainText('OCR');
  await scan.locator('[data-import]').click();
  await expect(page.locator('.find-cht')).toHaveText(['CHAPTER I', 'CHAPTER II']);
  await page.click('#modal .btn.primary');
  await waitTranslated(page, 1);
  await expect(en(page).first()).toContainText('Scanned first sentence number 1');
  await expect(page.locator('#userdoc')).not.toContainText('OLD EXAMPLE');      // the running head is gone
});

test('an arXiv paper is imported from its HTML version, titled and cited from the catalogue', async ({ page }) => {
  await signInAI(page);
  const ai = await mockAI(page);
  await mockSources(page);
  await openApp(page);
  await search(page, 'numbers trust', 'paper');
  await page.locator('#f-tier').selectOption('free');
  await item(page, 'Numbers and Trust in Public Science').locator('[data-import]').click();
  await waitTranslated(page, 2);
  await expect(page.locator('#userdoc .dt')).toHaveText('Numbers and Trust in Public Science');
  await expect(page.locator('#userdoc .dauth')).toHaveText('Rosa Example, Li Sample');
  await expect(page.locator('#userdoc .chips')).toContainText('开放论文');
  await expect(page.locator('#userdoc .chip-link')).toHaveAttribute('href', 'https://arxiv.org/abs/2401.00001');
  await expect(page.locator('#userdoc h2').first()).toContainText('Abstract');
  expect(ai.some((c) => /"title": "\.\.\."/.test(c.prompt)), 'no AI naming: the catalogue has the title').toBe(false);
  const d = await page.evaluate(async () => { const db = await window.claude.use('db'); return (await db.collection('docs').get()).docs[0].data(); });
  expect(d.mla).toBe('Example, Rosa, and Li Sample. “Numbers and Trust in Public Science.” <i>arXiv</i>, 2024, https://doi.org/10.48550/arxiv.2401.00001.');
});

test('an open-access PDF is read directly and keeps the catalogue details', async ({ page }) => {
  await mockSources(page);
  await openApp(page);
  await search(page, 'open numbers', 'paper');
  await item(page, 'Open Numbers in Policy').locator('[data-import]').click();
  await waitTranslated(page, 1);
  await expect(page.locator('#userdoc .dt')).toHaveText('Open Numbers in Policy');
  await expect(page.locator('#userdoc .chips')).toContainText('开放论文');
  await expect(page.locator('#userdoc .chips')).toContainText('CC BY');
  await expect(page.locator('#userdoc .chips')).toContainText('原文 1 页');
  await expect(en(page).first()).toContainText('The open paper sentence number 1');
});

test('when OpenAlex is out of free searches, arXiv still answers and the reader is told why', async ({ page }) => {
  page.allowErrors(/Failed to load resource.*429/);
  await mockSources(page, { openalex: 429 });
  await openApp(page);
  await search(page, 'numbers trust', 'paper');
  await expect(page.locator('.find-notes')).toContainText('OpenAlex 今天的免费查询次数用完了');
  await expect(item(page, 'Numbers and Trust in Public Science')).toHaveCount(1);
});
