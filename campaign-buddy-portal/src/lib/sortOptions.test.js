import { describe, it, expect } from 'vitest';
import { sortOptions, sortOptionsWithAllFirst } from './sortOptions';

describe('sortOptions', () => {
  it('sorts {value,label} options alphabetically by label', () => {
    const options = [{ value: 3, label: 'Nawala' }, { value: 1, label: 'Arpico' }, { value: 2, label: 'Glomark' }];
    expect(sortOptions(options).map((o) => o.label)).toEqual(['Arpico', 'Glomark', 'Nawala']);
  });

  it('is case-insensitive', () => {
    const options = [{ label: 'beta' }, { label: 'Alpha' }, { label: 'gamma' }];
    expect(sortOptions(options).map((o) => o.label)).toEqual(['Alpha', 'beta', 'gamma']);
  });

  it('accepts a custom key function for non-{value,label} rows', () => {
    const campaigns = [{ id: 'c1', name: 'Sktest Activation' }, { id: 'c2', name: 'Awrudy Activation' }, { id: 'c3', name: 'Radiance Q3 Push' }];
    expect(sortOptions(campaigns, (c) => c.name).map((c) => c.id)).toEqual(['c2', 'c3', 'c1']);
  });

  it('does not mutate the input array', () => {
    const options = [{ label: 'B' }, { label: 'A' }];
    const sorted = sortOptions(options);
    expect(options.map((o) => o.label)).toEqual(['B', 'A']);
    expect(sorted).not.toBe(options);
  });

  it('handles a missing/undefined label without throwing', () => {
    const options = [{ label: 'B' }, {}, { label: 'A' }];
    expect(() => sortOptions(options)).not.toThrow();
  });

  it('returns an empty array for nullish input', () => {
    expect(sortOptions(null)).toEqual([]);
    expect(sortOptions(undefined)).toEqual([]);
  });
});

describe('sortOptionsWithAllFirst', () => {
  it('keeps a blank-value "All" option pinned first regardless of its label', () => {
    const options = [{ value: 's3', label: 'Zara' }, { value: '', label: 'All Promoters' }, { value: 's1', label: 'Amal' }];
    expect(sortOptionsWithAllFirst(options).map((o) => o.label)).toEqual(['All Promoters', 'Amal', 'Zara']);
  });

  it('sorts normally when there is no "All" option', () => {
    const options = [{ value: 's3', label: 'Zara' }, { value: 's1', label: 'Amal' }];
    expect(sortOptionsWithAllFirst(options).map((o) => o.label)).toEqual(['Amal', 'Zara']);
  });
});
