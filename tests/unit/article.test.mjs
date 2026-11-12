import test from 'node:test';
import assert from 'node:assert/strict';
import { plainText, keepImage, markdownBlocks, articleFromReader } from '../../public/app/lib/article.js';

test('inline Markdown becomes plain text', () => {
  assert.equal(plainText('The **panopticon** is a [design](https://en.wikipedia.org/wiki/Design "Design") by *Bentham*.'), 'The panopticon is a design by Bentham.');
  assert.equal(plainText('Rotunda [link](https://en.wikipedia.org/wiki/Rotunda_(architecture) "Rotunda (architecture)") here'), 'Rotunda link here');
  assert.equal(plainText('A claim.[\\[1\\]](#cite_note-1)[\\[23\\]](#cite_note-23) Next'), 'A claim. Next');
  assert.equal(plainText('History\\[[edit](https://x.org/edit)\\]'), 'History');
  assert.equal(plainText('snake_case_name and 2*3*4 stay; `code` and ~~gone~~ lose their marks'), 'snake_case_name and 2*3*4 stay; code and gone lose their marks');
  assert.equal(plainText('AT&amp;T said &quot;no&quot;<br>twice<sup>2</sup>'), 'AT&T said "no" twice 2');
  assert.equal(plainText('Price is \\$5 \\* 2 \\[approx\\]'), 'Price is \\$5 * 2 [approx]');
});

test('headings, paragraphs, lists, quotes, rules and tables become blocks', () => {
  const md = ['# Title', '', 'First paragraph', 'continues here.', '', 'Setext Heading', '-----', '', '> A quoted line', '> goes on.', '',
    '*   Item one', '*   Item two', '1. Numbered', '', '* * *', '', '```js', 'const x = 1;', '```', '', '| Year | Event |', '|---|---|', '| 1791 | Plan drawn |', '', '## Sub ##'].join('\n');
  assert.deepEqual(markdownBlocks(md).map((b) => [b.k, b.en]), [
    ['h', 'Title'], ['p', 'First paragraph continues here.'], ['h', 'Setext Heading'], ['p', 'A quoted line goes on.'],
    ['p', 'Item one'], ['p', 'Item two'], ['p', 'Numbered'], ['p', '* * *'], ['p', 'Year — Event'], ['p', '1791 — Plan drawn'], ['h', 'Sub'],
  ]);
});

test('escaped brackets survive paragraph parsing: citation markers go, literal brackets stay', () => {
  const md = 'Numbers create distance.[\\[1\\]](#cite_note-1) Some \\[literal\\] text and 5 \\* 3.';
  assert.deepEqual(markdownBlocks(md).map((b) => b.en), ['Numbers create distance. Some [literal] text and 5 * 3.']);
});

test('images are kept only when asked for, once each, and never icons or logos', () => {
  const md = '[![Image 1: Plan of the prison](https://img.example.org/plan.jpg)](https://example.org/File:Plan.jpg)\n\nText with ![Image 2](https://img.example.org/inline.png) inside.\n\n'
    + '![Image 3: logo](https://example.org/assets/logo.png)\n\n![x](https://example.org/a.svg)\n\n![again](https://img.example.org/plan.jpg)\n\n![rel](/media/photo.webp)';
  assert.deepEqual(markdownBlocks(md).map((b) => [b.k, b.en]), [['p', 'Text with inside.']]);
  const withImages = markdownBlocks(md, { images: true, base: 'https://example.org/article/1' });
  assert.deepEqual(withImages.map((b) => (b.k === 'img' ? ['img', b.src, b.alt] : [b.k, b.en])), [
    ['img', 'https://img.example.org/plan.jpg', 'Plan of the prison'],
    ['img', 'https://img.example.org/inline.png', ''],
    ['p', 'Text with inside.'],
    ['img', 'https://example.org/media/photo.webp', 'rel'],
  ]);
  assert.equal(keepImage('javascript:alert(1)'), false);
  assert.equal(keepImage('data:image/png;base64,AAAA'), false);
  assert.equal(keepImage('https://cdn.example.org/tracking/pixel.gif'), false);
  assert.equal(keepImage('https://cdn.example.org/photos/iconic-view.jpg'), true);
});

test('the reader answer becomes a titled article; closing references are kept but marked', () => {
  const body = Array.from({ length: 6 }, (_, i) => `Paragraph ${i} about objectivity and the authority of numbers in public life.`).join('\n\n');
  const a = articleFromReader({
    title: 'How Eugenics Shaped Statistics - Nautilus', url: 'https://nautil.us/how-eugenics-shaped-statistics-238014/',
    metadata: { 'og:site_name': 'Nautilus', author: 'Aubrey Clayton', 'og:image': 'https://lede-admin.nautil.us/uploads/hero.png' },
    content: '# How Eugenics Shaped Statistics\n\n' + body + '\n\n## References\n\n1. Porter, T. Trust in Numbers.\n2. Stigler, S. The History of Statistics.\n\n![late](https://img.example.org/late.jpg)',
  }, { images: true });
  assert.equal(a.title, 'How Eugenics Shaped Statistics');
  assert.equal(a.author, 'Aubrey Clayton');
  assert.equal(a.site, 'Nautilus');
  assert.deepEqual(a.blocks.map((b) => b.k), ['img', 'p', 'p', 'p', 'p', 'p', 'p', 'h', 'ref', 'ref']);
  assert.equal(a.blocks[0].src, 'https://lede-admin.nautil.us/uploads/hero.png');      // no inline image → the page's lead image
  assert.equal(a.images, 1);
  assert.ok(a.cjk === 0 && a.chars > 400);
});

test('author lists and Chinese pages are recognised', () => {
  const a = articleFromReader({ title: 'Scientific Objectivity', url: 'https://plato.stanford.edu/entries/scientific-objectivity/', metadata: { citation_author: ['Reiss, Julian', 'Sprenger, Jan'] }, content: 'Objectivity is a value.' });
  assert.equal(a.author, 'Julian Reiss, Jan Sprenger');
  assert.equal(a.site, 'plato.stanford.edu');
  const zh = articleFromReader({ title: '客观性', url: 'https://example.cn/a', content: '客观性是一种价值。说某物是客观的，意味着它对我们有某种重要性。' });
  assert.ok(zh.cjk > 0.5);
});

test('a "Notes" heading early in the text does not turn the article into references', () => {
  const a = articleFromReader({ title: 'T', url: 'https://example.org/', content: '## Notes\n\nShort intro.\n\n' + 'Long paragraph of real content. '.repeat(30) });
  assert.deepEqual(a.blocks.map((b) => b.k), ['h', 'p', 'p']);
});

test('drop caps are rejoined, footnote lists become references, and a missing lead image adds nothing', () => {
  const a = articleFromReader({ title: 'T', url: 'https://example.org/x', metadata: {}, content: 'I n early 2018, officials were shocked.\n\nA new paragraph.\n\n1.   [↑](https://example.org/x#cite_ref-1)"Some Source". _Journal_. Retrieved 2025.' }, { images: true });
  assert.deepEqual(a.blocks.map((b) => [b.k, b.en]), [['p', 'In early 2018, officials were shocked.'], ['p', 'A new paragraph.'], ['ref', '"Some Source". Journal. Retrieved 2025.']]);
  assert.equal(articleFromReader({ title: 'T', url: 'https://e.org/', content: 'T he rest.\n\nA dog barked.' }).blocks[0].en, 'The rest.');
  assert.equal(articleFromReader({ title: 'T', url: 'https://e.org/', content: 'A dog barked.\n\nI am here.' }).blocks[0].en, 'A dog barked.');
});
