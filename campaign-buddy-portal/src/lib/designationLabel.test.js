import { describe, it, expect } from 'vitest';
import { applyDesignationLabel } from './designationLabel';

describe('applyDesignationLabel', () => {
  it('replaces the whole word "Promoter" with the campaign label', () => {
    expect(applyDesignationLabel('Promoter', 'Beauty Advisor')).toBe('Beauty Advisor');
  });

  it('replaces "Promoters" (plural) with the pluralized label', () => {
    expect(applyDesignationLabel('All Promoters', 'Beauty Advisor')).toBe('All Beauty Advisors');
  });

  it('replaces every occurrence in a longer string', () => {
    expect(applyDesignationLabel('Promoter Tracking — GPS trail for a Promoter', 'BA'))
      .toBe('BA Tracking — GPS trail for a BA');
  });

  it('is case-insensitive and lowercases the label to match a lowercase mid-sentence use', () => {
    expect(applyDesignationLabel("Manual correction screen for a promoter's daily sales.", 'Beauty Advisor'))
      .toBe("Manual correction screen for a beauty Advisor's daily sales.");
  });

  it('is word-boundary safe — does not touch "Promotion" or similar substrings', () => {
    expect(applyDesignationLabel('Promotion running?', 'Beauty Advisor')).toBe('Promotion running?');
  });

  it('returns the original text unchanged when no label is set', () => {
    expect(applyDesignationLabel('Promoter', '')).toBe('Promoter');
    expect(applyDesignationLabel('Promoter', null)).toBe('Promoter');
    expect(applyDesignationLabel('Promoter', undefined)).toBe('Promoter');
  });

  it('passes through text with no "Promoter" in it unchanged', () => {
    expect(applyDesignationLabel('Outlet', 'Beauty Advisor')).toBe('Outlet');
  });

  it('handles null/undefined text without throwing', () => {
    expect(applyDesignationLabel(null, 'Beauty Advisor')).toBe(null);
    expect(applyDesignationLabel(undefined, 'Beauty Advisor')).toBe(undefined);
  });
});
