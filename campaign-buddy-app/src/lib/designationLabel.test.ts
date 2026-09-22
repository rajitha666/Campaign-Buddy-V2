import { describe, it, expect } from 'vitest';
import { applyDesignationLabel } from './designationLabel';

// #64: a campaign can rename "Promoter" (e.g. "Beauty Advisor"); the app swaps
// the word wherever it would otherwise say it. Mirrors the portal's helper.
describe('applyDesignationLabel', () => {
  it('leaves text alone when the campaign has no custom label', () => {
    expect(applyDesignationLabel('Field Promoter', null)).toBe('Field Promoter');
    expect(applyDesignationLabel('Field Promoter', undefined)).toBe('Field Promoter');
  });

  it('swaps the word, keeping the label capitalised when the original was', () => {
    expect(applyDesignationLabel('Field Promoter', 'Beauty Advisor')).toBe('Field Beauty Advisor');
    expect(applyDesignationLabel('Scoring promoter: Nimal', 'Beauty Advisor')).toBe('Scoring beauty Advisor: Nimal');
  });

  it('handles plurals and does not touch longer words', () => {
    expect(applyDesignationLabel('Promoters', 'Advisor')).toBe('Advisors');
    expect(applyDesignationLabel('Promotion', 'Advisor')).toBe('Promotion');
  });
});
