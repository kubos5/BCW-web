// Piccolo generatore di PDF di una pagina, per i documenti della modalità demo.

function latin1(text) {
  // I font standard del PDF usano la codifica WinAnsi: i caratteri fuori da Latin-1 diventano "?".
  return [...text].map((ch) => (ch.charCodeAt(0) < 256 ? ch : ch === '–' ? '-' : '?')).join('');
}

function escapePDF(text) {
  return latin1(text).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrap(text, maxChars) {
  const lines = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(' ')) {
      if ((line + ' ' + word).trim().length > maxChars) {
        lines.push(line);
        line = word;
      } else {
        line = (line + ' ' + word).trim();
      }
    }
    lines.push(line);
  }
  return lines;
}

export function makePDF(title, body) {
  const bodyLines = wrap(body, 80);
  let content = 'BT /F1 28 Tf 56 760 Td (' + escapePDF(title) + ') Tj ET\n';
  bodyLines.forEach((line, i) => {
    content += `BT /F2 14 Tf 56 ${712 - i * 20} Td (${escapePDF(line)}) Tj ET\n`;
  });
  content += '0.5 g BT /F2 10 Tf 56 52 Td (' + escapePDF('BCW · Modalità demo') + ') Tj ET\n';

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((object, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xFF;
  return bytes;
}
