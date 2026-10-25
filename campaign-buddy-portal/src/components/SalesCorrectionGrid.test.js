import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const page = readFileSync(fileURLToPath(new URL('../components/SalesCorrectionGrid.jsx', import.meta.url)), 'utf8');

describe('SalesCorrectionGrid', () => {
  it('shows a Total Sales column computed from unitPrice x soldToday', () => {
    expect(page).toMatch(/<th>Total Sales<\/th>/);
    expect(page).toMatch(/unitPrice \|\| 0\) \* Number\(r\.soldToday \|\| 0/);
  });

  it('saves per row (blank rows create a new record) instead of a bulk checkbox save', () => {
    expect(page).toMatch(/onClick=\{\(\) => updateRow\(i\)\}>Update</);
    expect(page).not.toMatch(/Save corrections/);
    expect(page).not.toMatch(/type="checkbox"/);
    expect(page).toMatch(/salesRecordsApi\.create\(campaignId, \{/);
  });

  it('archives a row only after confirmation (soft delete, sales-archive-spec.md)', () => {
    expect(page).toMatch(/onClick=\{\(\) => archiveRow\(i\)\}>Archive</);
    expect(page).toMatch(/title: 'Archive this sales record\?'/);
    expect(page).toMatch(/if \(!ok\) return;/);
    expect(page).not.toMatch(/window\.confirm/);
    expect(page).toMatch(/archiveRow\(idx\)/);
    expect(page).not.toMatch(/type="checkbox" checked/);
  });

  it('shows archived rows muted (no badge) with an Unarchive action', () => {
    expect(page).toMatch(/opacity: 0\.55/);
    expect(page).not.toMatch(/badge pending/);
    expect(page).toMatch(/title: 'Unarchive this sales record\?'/);
  });

  it('keeps the actions cell a fixed width and never reloads the grid', () => {
    // all three buttons always render; irrelevant ones hidden in place
    expect(page).toMatch(/visibility: r\.archived \? 'hidden' : 'visible'/);
    expect(page).toMatch(/visibility: r\.archived \|\| r\.id == null \? 'hidden' : 'visible'/);
    // rows patch in place — archive/unarchive/create must not call loadSales()
    expect(page).toMatch(/setRows\(\(rs\) => rs\.map\(\(row, i\) => \(i === idx \? \{ \.\.\.row, archived: true \} : row\)\)\)/);
    expect(page).toMatch(/\{ \.\.\.row, id: created\?\.data\?\.id \?\? row\.id \}/);
  });

  it('disables editing stock on archived rows', () => {
    expect(page).toMatch(/disabled=\{r\.archived\}/);
  });

  it('shows a tinted ✓ / ! status chip beside the product name after actions', () => {
    expect(page).toMatch(/rowFeedback\[r\.activationItemId\]/);
    expect(page).toMatch(/width: 22, minWidth: 22, height: 20/);
    expect(page).toMatch(/rowFeedback\[r\.activationItemId\]\.kind === 'ok' \? 'var\(--success-tint\)' : 'var\(--alert-tint\)'/);
    expect(page).toMatch(/'chipPop 180ms ease-out'/);
    expect(page).toMatch(/setTimeout/);
    expect(page).toMatch(/clearTimeout\(feedbackTimers\.current\[itemId\]\)/);
    expect(page).not.toMatch(/'Saved ✓'/);
  });

  it('saves day-level custom fields with a dedicated button', () => {
    expect(page).toMatch(/Save daily fields/);
    expect(page).toMatch(/onClick=\{saveDayFields\}/);
  });

  it('includes Total Sales in the CSV export and skips archived rows', () => {
    expect(page).toMatch(/'Sold Qty', 'Total Sales'/);
    expect(page).toMatch(/filter\(\(r\) => !r\.archived\)/);
  });
});
