// Small files generated on the fly, so the repository carries no binary test fixtures.

// A one-page PDF with a real text layer: one line of 11 pt Helvetica per entry.
export function makePdf(lines) {
  const text = ['BT', '/F1 11 Tf', '72 720 Td', '14 TL']
    .concat(lines.map((l) => `(${l.replace(/([\\()])/g, '\\$1')}) Tj T*`), ['ET']).join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const at = [];
  objs.forEach((o, i) => { at.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + at.map((n) => String(n).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

// Wrap prose into PDF-sized lines (about 85 characters each); a blank entry leaves a paragraph gap.
export function wrap(paragraphs, width = 85) {
  const lines = [];
  paragraphs.forEach((p, i) => {
    if (i) lines.push('');
    let cur = '';
    for (const w of p.split(' ')) {
      if ((cur + ' ' + w).trim().length > width) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
    }
    if (cur) lines.push(cur);
  });
  return lines;
}
