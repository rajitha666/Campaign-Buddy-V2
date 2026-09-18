// Canonical filename for any downloaded report: "<Report Name> - <download date time>.<ext>"
// so exports stay identifiable once several pile up in a Downloads folder. Colons are
// swapped for hyphens in the time portion since they're illegal in Windows filenames.
export function exportFilename(reportName, ext = 'csv', date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
    + `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  return `${reportName} - ${stamp}.${ext}`;
}
