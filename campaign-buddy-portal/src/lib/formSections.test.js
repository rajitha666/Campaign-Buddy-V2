import { describe, it, expect } from 'vitest';
import { groupFields, sectionSummary, sectionStartsOpen, fieldError, groupsWithErrors } from './formSections';

const fields = [
  { key: 'a', label: 'A', type: 'text', required: true },
  { type: 'section', label: 'Bank', collapsible: true },
  { key: 'b', label: 'B', type: 'text' },
  { key: 'c', label: 'C', type: 'text' },
  { key: 'r', label: 'R', type: 'radio', options: ['x', 'y'] },
  { type: 'section', label: 'Plain' },
  { key: 'd', label: 'D', type: 'text' },
];

describe('groupFields', () => {
  it('splits at section headers; leading fields form an unlabeled group', () => {
    const g = groupFields(fields);
    expect(g.map((x) => [x.label, x.collapsible, x.fields.map((f) => f.key)])).toEqual([
      [null, false, ['a']], ['Bank', true, ['b', 'c', 'r']], ['Plain', false, ['d']],
    ]);
  });

  it('a form with no sections is one non-collapsible group (renders as today)', () => {
    const g = groupFields([{ key: 'a', type: 'text' }]);
    expect(g).toHaveLength(1);
    expect(g[0].collapsible).toBe(false);
  });
});

describe('sectionSummary', () => {
  const [, bank] = groupFields(fields);
  it('counts filled input fields, ignoring radios that always carry a default', () => {
    expect(sectionSummary(bank, { b: 'x', c: '', r: 'x' })).toBe('1 of 2 filled');
    expect(sectionSummary(bank, {})).toBe('0 of 2 filled');
  });
});

describe('sectionStartsOpen', () => {
  const [, bank] = groupFields(fields);
  it('is closed when adding, even with defaults', () => {
    expect(sectionStartsOpen(bank, { b: 'x' }, 'add')).toBe(false);
  });
  it('opens when editing a record that has data in the section', () => {
    expect(sectionStartsOpen(bank, { b: 'x' }, 'edit')).toBe(true);
    expect(sectionStartsOpen(bank, { b: '', c: '', r: 'x' }, 'edit')).toBe(false);
  });
  it('non-collapsible sections are always open', () => {
    expect(sectionStartsOpen(groupFields(fields)[2], {}, 'add')).toBe(true);
  });
});

describe('fieldError', () => {
  it('flags required blanks and runs custom validators on non-empty values', () => {
    expect(fieldError({ key: 'a', required: true, type: 'text' }, '')).toBe('Required');
    expect(fieldError({ key: 'a', type: 'text', validate: () => 'Bad' }, 'x')).toBe('Bad');
    expect(fieldError({ key: 'a', type: 'text', validate: () => 'Bad' }, '')).toBeUndefined();
    expect(fieldError({ key: 'm', type: 'multi-checkbox', required: true }, [])).toBe('Required');
  });
  it('skips hidden resettable fields and section headers', () => {
    expect(fieldError({ key: 'p', required: true, type: 'text' }, '', { hidden: true })).toBeUndefined();
    expect(fieldError({ type: 'section' }, '')).toBeUndefined();
  });
});

describe('groupsWithErrors', () => {
  it('returns indexes of groups containing an errored field', () => {
    const g = groupFields(fields);
    expect([...groupsWithErrors(g, { c: 'Required' })]).toEqual([1]);
    expect([...groupsWithErrors(g, {})]).toEqual([]);
  });
});
