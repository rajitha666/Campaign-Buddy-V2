// Pure helpers behind the Drawer's sections (progressive disclosure, #115).
// A `{ type: 'section', label, collapsible?: true }` entry starts a group; fields
// before the first header form an unlabeled group that is always open. Sections
// without `collapsible` render exactly as the old plain dividers did.

const isInput = (f) => f.type !== 'section';
// Radios and the upload picker always carry a value or a File, so they say
// nothing about whether the user filled the section in.
const countable = (f) => isInput(f) && f.type !== 'radio' && f.type !== 'upload';

export function groupFields(fields) {
  const groups = [{ label: null, collapsible: false, fields: [] }];
  fields.forEach((f) => {
    if (f.type === 'section') groups.push({ label: f.label, collapsible: !!f.collapsible, fields: [] });
    else groups[groups.length - 1].fields.push(f);
  });
  // A leading empty group exists only when the form opens with a header.
  return groups[0].fields.length === 0 && groups.length > 1 ? groups.slice(1) : groups;
}

export function isFilled(value) {
  if (value == null || value === '') return false;
  if (Array.isArray(value)) return value.some((v) => v !== '' && v != null);
  if (typeof value === 'object' && !(value instanceof File)) return Object.values(value).some((v) => v !== '' && v != null);
  return true;
}

export function sectionSummary(group, values) {
  const fs = group.fields.filter(countable);
  const filled = fs.filter((f) => isFilled(values[f.key])).length;
  return `${filled} of ${fs.length} filled`;
}

export function sectionStartsOpen(group, values, mode) {
  if (!group.collapsible) return true;
  if (mode !== 'edit') return false;
  return group.fields.filter(countable).some((f) => isFilled(values[f.key]));
}

export function fieldError(f, value, { hidden = false } = {}) {
  if (!isInput(f) || hidden) return undefined;
  if (f.type === 'multi-checkbox') return f.required && (value || []).length === 0 ? 'Required' : undefined;
  if (f.required && !value && f.type !== 'builder') return 'Required';
  if (f.validate && value) return f.validate(value) || undefined;
  return undefined;
}

export function groupsWithErrors(groups, errors) {
  const out = new Set();
  groups.forEach((g, i) => { if (g.fields.some((f) => errors[f.key])) out.add(i); });
  return out;
}
