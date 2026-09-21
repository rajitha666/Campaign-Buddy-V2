// Shared CSV building for every report export.
//
// Unicode dash variants (hyphen U+2010, non-breaking hyphen U+2011, en/em dash,
// minus sign, ...) are folded to an ASCII hyphen: the files are UTF-8 without a
// BOM, so Excel decodes those characters as mojibake in outlet names.
const UNICODE_DASHES = /[‐-―−]/g;

export function csvCell(v) {
  const s = (v == null ? '' : String(v)).replace(UNICODE_DASHES, '-');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Quote a field only when it needs it (comma, quote or newline), doubling quotes.
export function toCsv(lines) {
  return lines.map((l) => l.map(csvCell).join(',')).join('\n');
}

export function downloadCsv(filename, lines) {
  const blob = new Blob([toCsv(lines)], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
