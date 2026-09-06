import { describe, it, expect } from 'vitest';
import { RESOURCES } from './resources';

describe('resources config', () => {
  it('every resource has a title, subtitle and fetchList', () => {
    for (const [key, cfg] of Object.entries(RESOURCES)) {
      expect(cfg.title, `${key}.title`).toBeTypeOf('string');
      expect(cfg.subtitle, `${key}.subtitle`).toBeTypeOf('string');
      expect(cfg.fetchList, `${key}.fetchList`).toBeTypeOf('function');
      expect(Array.isArray(cfg.columns), `${key}.columns`).toBe(true);
    }
  });

  it('a resource that renders an edit/delete action also wires the handler', () => {
    for (const [key, cfg] of Object.entries(RESOURCES)) {
      const actions = cfg.actions || [];
      if (actions.includes('edit')) expect(cfg.updateItem, `${key}.updateItem`).toBeTypeOf('function');
      if (actions.includes('delete')) expect(cfg.deleteItem, `${key}.deleteItem`).toBeTypeOf('function');
      // createItem is only meaningful when the page shows an Add button
      if (cfg.createItem) expect(cfg.formFields, `${key}.formFields`).toBeDefined();
    }
  });

  it('every formField has a key (except section dividers) and a type', () => {
    for (const [key, cfg] of Object.entries(RESOURCES)) {
      for (const f of cfg.formFields || []) {
        if (f.type === 'section') continue;
        expect(f.key, `${key} field missing key`).toBeTypeOf('string');
        expect(f.type, `${key}.${f.key} missing type`).toBeTypeOf('string');
      }
    }
  });
});
