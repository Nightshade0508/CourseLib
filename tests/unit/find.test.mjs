// 找资料: the shapes below follow what each service actually returned when probed (field names and nesting);
// the values are made up.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseQuery, arxivQueries, abstractFrom, fromOpenAlex, parseArxivFeed, fromGutendex, fromOpenLibrary, merge, rank,
  stripGutenberg, splitChapters, ocrBlocks, citation, firstLast, wordsIn,
} from '../../public/app/lib/find.js';
import { markdownBlocks } from '../../public/app/lib/article.js';

const words = (n, w = 'word') => Array.from({ length: n }, () => w).join(' ');

test('queries: DOIs and arXiv ids are recognised, anything else is words', () => {
  assert.deepEqual(parseQuery('https://doi.org/10.1145/3313831.3376727'), { doi: '10.1145/3313831.3376727' });
  assert.deepEqual(parseQuery('doi: 10.1038/S41586-020-2649-2.'), { doi: '10.1038/s41586-020-2649-2' });
  assert.deepEqual(parseQuery('arXiv:1706.03762v7'), { arxiv: '1706.03762' });
  assert.deepEqual(parseQuery('https://arxiv.org/abs/2209.15001'), { arxiv: '2209.15001' });
  assert.deepEqual(parseQuery('trust in numbers 1995'), { words: 'trust in numbers 1995' });
});

test('OpenAlex: open papers with a full-text address can be imported, others only linked', () => {
  assert.equal(abstractFrom({ Numbers: [0], create: [1], distance: [2, 4], and: [3] }), 'Numbers create distance and distance');
  const base = { id: 'https://openalex.org/W1', display_name: 'Trust in Numbers', publication_year: 1995, cited_by_count: 5000, language: 'en',
    authorships: [{ author: { display_name: 'Theodore M. Porter' } }], primary_location: { source: { display_name: 'Princeton UP' }, landing_page_url: 'https://x.org/p' } };
  const paid = fromOpenAlex({ ...base, doi: 'https://doi.org/10.1/abc', open_access: { is_oa: false } });
  assert.equal(paid.access, 'link');
  assert.equal(paid.why, '需要订阅或付费');
  assert.equal(paid.link, 'https://doi.org/10.1/abc');
  const open = fromOpenAlex({ ...base, doi: 'https://doi.org/10.2/xyz', open_access: { is_oa: true },
    best_oa_location: { pdf_url: 'https://repo.example.edu/paper.pdf', landing_page_url: 'https://repo.example.edu/p', license: 'cc-by', version: 'acceptedVersion' } });
  assert.equal(open.access, 'import');
  assert.deepEqual(open.full, { type: 'pdf', url: 'https://repo.example.edu/paper.pdf', page: 'https://repo.example.edu/p' });
  assert.equal(open.license, 'CC BY · 作者接受稿');
  const viaArxiv = fromOpenAlex({ ...base, doi: 'https://doi.org/10.48550/arxiv.1706.03762', open_access: { is_oa: true } });
  assert.deepEqual(viaArxiv.full, { type: 'arxiv', id: '1706.03762' });
  assert.equal(fromOpenAlex({ ...base, language: 'de', open_access: { is_oa: true }, best_oa_location: { pdf_url: 'https://x/p.pdf' } }).why, '不是英文');
});

test('arXiv queries: the phrase first, then the meaningful words', () => {
  assert.deepEqual(arxivQueries('Attention is all you need'), ['all:"attention is all you need"', 'all:attention AND all:need']);
  assert.deepEqual(arxivQueries('transformers'), ['all:transformers']);
  assert.deepEqual(arxivQueries('"quoted" (words)'), ['all:"quoted words"', 'all:quoted AND all:words']);
});

test('arXiv: the Atom feed becomes papers', () => {
  const xml = `<?xml version='1.0'?><feed xmlns="http://www.w3.org/2005/Atom"><entry>
    <id>http://arxiv.org/abs/2209.15001v3</id><published>2022-09-29T17:57:08Z</published>
    <title>Dilated Neighborhood
      Attention Transformer</title><summary>  We present &amp; evaluate a model.  </summary>
    <author><name>Ali Hassani</name></author><author><name>Humphrey Shi</name></author>
    <arxiv:journal_ref>CVPR 2023</arxiv:journal_ref></entry><entry><id>http://arxiv.org/abs/1706.03762v7</id><title>Attention Is All You Need</title>
    <published>2017-06-12T17:57:34Z</published><summary>x</summary><author><name>Ashish Vaswani</name></author><arxiv:doi>10.48550/arXiv.1706.03762</arxiv:doi></entry></feed>`;
  const [a, b] = parseArxivFeed(xml);
  assert.equal(a.title, 'Dilated Neighborhood Attention Transformer');
  assert.deepEqual(a.authors, ['Ali Hassani', 'Humphrey Shi']);
  assert.equal(a.year, 2022);
  assert.equal(a.venue, 'CVPR 2023');
  assert.equal(a.abstract, 'We present & evaluate a model.');
  assert.deepEqual(a.full, { type: 'arxiv', id: '2209.15001' });
  assert.equal(b.key, 'doi:10.48550/arxiv.1706.03762');
});

test('Gutenberg and Open Library: public-domain English books can be imported; borrowable ones cannot', () => {
  const g = fromGutendex({ id: 84, title: 'Frankenstein; or, The modern Prometheus', authors: [{ name: 'Shelley, Mary Wollstonecraft', birth_year: 1797 }], languages: ['en'], copyright: false, download_count: 182729 });
  assert.equal(g.access, 'import');
  assert.deepEqual(g.full, { type: 'gutenberg', id: 84 });
  assert.deepEqual(g.authors, ['Mary Wollstonecraft Shelley']);
  assert.equal(fromGutendex({ id: 9, title: 'X', authors: [], languages: ['fr'], copyright: false }).why, '不是英文');
  assert.equal(fromGutendex({ id: 9, title: 'X', authors: [], languages: ['en'], copyright: true }).access, 'link');

  const ol = (o) => fromOpenLibrary({ key: '/works/OL1W', title: 'Frankenstein; or, The Modern Prometheus', author_name: ['Mary Shelley'], first_publish_year: 1818, language: ['ger', 'eng'], ...o });
  assert.deepEqual(ol({ ebook_access: 'public', id_project_gutenberg: ['41445'], ia: ['a'] }).full, { type: 'gutenberg', id: 41445 });
  assert.deepEqual(ol({ ebook_access: 'public', ia: ['scan1', 'scan2'] }).full, { type: 'ia', ids: ['scan1', 'scan2'] });
  const lent = ol({ ebook_access: 'borrowable', ia: ['x'] });
  assert.equal(lent.access, 'link');
  assert.match(lent.why, /借阅/);
  assert.equal(ol({ ebook_access: 'no_ebook' }).why, '没有电子版');
  assert.equal(ol({ ebook_access: 'public', ia: ['x'], language: ['fre'] }).why, '不是英文');
});

test('the same work from several catalogues is one result, keeping the best way to the text', () => {
  const g = fromGutendex({ id: 84, title: 'Frankenstein; or, The modern Prometheus', authors: [{ name: 'Shelley, Mary Wollstonecraft' }], languages: ['en'], copyright: false, download_count: 1000 });
  const o = fromOpenLibrary({ key: '/works/OL1W', title: 'Frankenstein; Or, The Modern Prometheus', author_name: ['Mary Shelley'], first_publish_year: 1818, ebook_access: 'public', ia: ['scan'], edition_count: 2000 });
  const lent = fromOpenLibrary({ key: '/works/OL2W', title: "Dean Koontz's Frankenstein", author_name: ['Dean Koontz'], ebook_access: 'borrowable' });
  const m = merge([o, lent, g]);
  assert.equal(m.length, 2);
  assert.deepEqual(m[0].sources, ['openlibrary', 'gutenberg']);
  assert.deepEqual(m[0].full, { type: 'gutenberg', id: 84 });          // Gutenberg's text beats a scan
  assert.equal(m[0].year, 1818);                                        // Open Library's date is kept
  assert.equal(m[0].gutenberg, 84);

  const ax = parseArxivFeed('<entry><id>http://arxiv.org/abs/1706.03762v7</id><title>Attention Is All You Need</title><published>2017-06-12</published><summary>s</summary><author><name>Ashish Vaswani</name></author></entry>')[0];
  const oa = fromOpenAlex({ id: 'W2', doi: 'https://doi.org/10.48550/arxiv.1706.03762', display_name: 'Attention Is All You Need', publication_year: 2017, cited_by_count: 90000, authorships: [], open_access: { is_oa: true } });
  const p = merge([oa, ax]);
  assert.equal(p.length, 1);
  assert.equal(p[0].cites, 90000);
  assert.deepEqual(p[0].sources, ['openalex', 'arxiv']);
});

test('ranking: a close match first; importable text lifts a result but does not beat relevance', () => {
  const mk = (title, access, extra = {}) => ({ key: title, kind: 'book', title, authors: [], sources: ['x'], access, full: access === 'import' ? { type: 'gutenberg' } : undefined, ...extra });
  const r = rank([mk('A Study of Frankenstein Films', 'link', { editions: 50 }), mk('Frankenstein', 'import'), mk('Unrelated', 'import')], 'Frankenstein');
  assert.deepEqual(r.map((x) => x.title), ['Frankenstein', 'A Study of Frankenstein Films', 'Unrelated']);
  const tie = rank([mk('Frankenstein', 'link'), mk('Frankenstein', 'import')], 'Frankenstein');
  assert.equal(tie[0].access, 'import');
});

test('Gutenberg plain text: licence header and footer are removed', () => {
  const t = 'The Project Gutenberg eBook of X\n\n*** START OF THE PROJECT GUTENBERG EBOOK X ***\n\nCHAPTER I\n\nIt began.\n\n*** END OF THE PROJECT GUTENBERG EBOOK X ***\n\nLicence text';
  assert.equal(stripGutenberg(t), 'CHAPTER I\n\nIt began.');
  assert.equal(stripGutenberg('No markers here.'), 'No markers here.');
});

test('a book splits into chapters at the heading level that names chapters', () => {
  const md = ['### or, the Modern Prometheus', '## by A. Writer', '* * *',
    '## [](https://www.gutenberg.org/x)Letter 1', words(700), '## [](https://www.gutenberg.org/x)Letter 2', words(650),
    '## [](https://www.gutenberg.org/x)Chapter 1', '### A note', words(900), '## [](https://www.gutenberg.org/x)Chapter 2', words(1200)].join('\n\n');
  const ch = splitChapters(markdownBlocks(md));
  assert.deepEqual(ch.map((c) => c.title), ['Letter 1', 'Letter 2', 'Chapter 1', 'Chapter 2']);
  assert.deepEqual(ch.map((c) => c.words), [700, 650, 900 + 2, 1200]);
  assert.ok(ch[0].blocks.every((b) => b.k !== 'h'));                    // the title page does not leak in as headings
  assert.ok(ch[2].blocks.some((b) => b.k === 'h' && b.en === 'A note')); // sub-headings stay inside their chapter

  const flat = splitChapters(markdownBlocks('# Essay\n\n' + words(300)), { title: 'Essay' });
  assert.equal(flat.length, 1);
  assert.equal(flat[0].words, 300);
  const long = splitChapters(markdownBlocks(['Preface text ' + words(800), '## Chapter I', words(700), '## Chapter II', words(700)].join('\n\n')), { leadTitle: '前言' });
  assert.deepEqual(long.map((c) => c.title), ['前言', 'Chapter I', 'Chapter II']);
});

test('OCR text from scans: headings found, running heads, page numbers and noise dropped, split paragraphs rejoined', () => {
  const page = (n) => `\n\nTHE  BOOK  ;  OR,\n\n${n}\n\n`;
  const t = ['mm*', '■ viWww u>Q5»» uMiKKkio >>v', 'LETTER  I.', 'To  Mrs.  Saville,  England.',
    'You will rejoice to hear that no disaster has accompanied the com-\nmencement of an enterprise which you have regarded with',
    page(12).trim(), 'such evil forebodings. I arrived here yesterday.',
    'A letter from a person in Scotland, who had formerly been a friend, arrived.', 'CHAPTER  II.', 'It was a dark night and the rain fell.',
    page(13).trim(), 'CHAPTER  II.', 'And it went on.', page(14).trim(), page(15).trim(), 'Chapter 3', 'Short.'].join('\n\n');
  const b = ocrBlocks(t);
  assert.deepEqual(b.map((x) => [x.k, x.en]), [
    ['h', 'LETTER I'], ['p', 'To Mrs. Saville, England.'],
    ['p', 'You will rejoice to hear that no disaster has accompanied the commencement of an enterprise which you have regarded with such evil forebodings. I arrived here yesterday.'],
    ['p', 'A letter from a person in Scotland, who had formerly been a friend, arrived.'],
    ['h', 'CHAPTER II'], ['p', 'It was a dark night and the rain fell.'], ['p', 'And it went on.'], ['h', 'Chapter 3'],
  ]);
  assert.deepEqual(splitChapters(b).map((c) => c.title), ['LETTER I', 'CHAPTER II', 'Chapter 3']);
});

test('a clean Gutenberg text ranks above a scan of the same book', () => {
  const mk = (type) => ({ key: type, kind: 'book', title: 'Frankenstein', authors: [], sources: ['x'], access: 'import', full: { type } });
  assert.equal(rank([mk('ia'), mk('gutenberg')], 'Frankenstein')[0].full.type, 'gutenberg');
});

test('citations come from the catalogue data', () => {
  const g = fromGutendex({ id: 84, title: 'Frankenstein; or, The modern Prometheus', authors: [{ name: 'Shelley, Mary Wollstonecraft' }], languages: ['en'], copyright: false });
  g.year = 1818;
  assert.deepEqual(citation(g), { mla: 'Shelley, Mary Wollstonecraft. <i>Frankenstein; or, The modern Prometheus</i>. 1818. Project Gutenberg, www.gutenberg.org/ebooks/84.', citeA: 'Shelley' });
  const p = parseArxivFeed('<entry><id>http://arxiv.org/abs/1706.03762v7</id><title>Attention Is All You Need</title><published>2017-06-12</published><summary>s</summary><author><name>Ashish Vaswani</name></author><author><name>Noam Shazeer</name></author><author><name>Niki Parmar</name></author></entry>')[0];
  assert.deepEqual(citation(p), { mla: 'Vaswani, Ashish, et al. “Attention Is All You Need.” <i>arXiv</i>, 2017, https://doi.org/10.48550/arxiv.1706.03762.', citeA: 'Vaswani et al.' });
  assert.equal(firstLast('Porter, Theodore M.'), 'Theodore M. Porter');
  assert.equal(wordsIn([{ k: 'p', en: "It's a test-case." }, { k: 'ref', en: 'ignored words' }]), 3);
});
