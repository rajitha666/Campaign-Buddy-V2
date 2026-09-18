// Plain-text value for a resource-table column, used by CSV export so the
// download matches what the on-screen table actually shows. A column's
// `render` often derives its display value from a nested path or a computed
// field (e.g. remainingStock = openingStock - soldToday) that doesn't exist
// as a raw key on the row, so exporting `row[key]` directly leaves it blank.
export function columnText(column, row) {
  if (typeof column.csvValue === 'function') return column.csvValue(row);
  if (typeof column.render === 'function') {
    const rendered = column.render(row);
    if (typeof rendered === 'string' || typeof rendered === 'number') return rendered;
    // A JSX element (e.g. a Badge/Avatar) — fall back to the raw field rather
    // than stringify a React element.
    return row[column.key];
  }
  return row[column.key];
}
