import { describe, it, expect, vi, afterEach } from 'vitest';
import { RESOURCES } from './resources';
import { outlets as outletsApi, items as itemsApi } from '../lib/endpoints';

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

  it('outlets payload includes the required outletNo (backend-side validation)', async () => {
    const spy = vi.spyOn(outletsApi, 'create').mockResolvedValue({ data: {} });
    try {
      await RESOURCES.outlets.createItem({ values: { outletNo: 'OUT-0100', name: 'X', geo: { lat: '6.9', lng: '79.8' } } });
      expect(spy).toHaveBeenCalledOnce();
      const body = spy.mock.calls[0][0];
      expect(body.outletNo).toBe('OUT-0100');
    } finally {
      spy.mockRestore();
    }
  });

  it('outlets phone/mobile/fax use native tel field types with autofill-tolerant patterns', () => {
    const fields = Object.fromEntries(
      ['phone', 'mobile', 'fax'].map((k) => [k, RESOURCES.outlets.formFields.find((f) => f.key === k)])
    );
    for (const [k, f] of Object.entries(fields)) {
      expect(f.type, `${k}.type`).toBe('tel');
      expect(f.pattern, `${k}.pattern`).toBeTypeOf('string');
      // autofilled formats must match the pattern (pattern blocks submit):
      const samples = k === 'fax'
        ? ['+94112345678']
        : ['+94771234567', '+94 71 222 2222', '+94-71-2222222', '0771234567'];
      for (const sample of samples) {
        expect(new RegExp(`^${f.pattern}$`).test(sample), `${k}: ${sample}`).toBe(true);
      }
      if (k !== 'fax') expect(new RegExp(`^${f.pattern}$`).test('abc')).toBe(false);
    }
  });

  it('outlets geo lat/lng inputs are native number fields', () => {
    expect(RESOURCES.outlets.formFields.find((f) => f.type === 'geo')?.latLngType || 'number').toBe('number');
  });

  it('items create payload includes the required sku (backend-side validation)', async () => {
    const spy = vi.spyOn(itemsApi, 'create').mockResolvedValue({ data: { id: 'i_1' } });
    try {
      await RESOURCES.items.createItem({ values: { name: 'X', brandId: 'b_1', sku: 'TF-320-TT', unitPrice: '3200', reorderLevel: '5' } });
      expect(spy).toHaveBeenCalledOnce();
      const body = spy.mock.calls[0][0];
      expect(body.sku).toBe('TF-320-TT');
      expect(body.name).toBe('X');
      expect(body.brandId).toBe('b_1');
      expect(body.unitPrice).toBe(3200);
    } finally {
      spy.mockRestore();
    }
  });

  it('items form has a required sku field', () => {
    const sku = RESOURCES.items.formFields.find((f) => f.key === 'sku');
    expect(sku).toBeDefined();
    expect(sku.required).toBe(true);
    expect(sku.validate('')).toBeTypeOf('string');
    expect(sku.validate('TF-320-TT')).toBeNull();
  });

  it('items unitPrice and reorderLevel are native integer number fields (ACH)', async () => {
    const unitPrice = RESOURCES.items.formFields.find((f) => f.key === 'unitPrice');
    const reorder = RESOURCES.items.formFields.find((f) => f.key === 'reorderLevel');
    expect(unitPrice.type).toBe('number');
    expect(unitPrice.step).toBe(1);
    expect(reorder.type).toBe('number');
    expect(reorder.step).toBe(1);

    // decimal input is rejected by field validators, not left to the backend
    expect(unitPrice.validate('12.5')).toBeTypeOf('string');
    expect(unitPrice.validate('1200')).toBeNull();
    expect(reorder.validate('5')).toBeNull();
    expect(reorder.validate('1.5')).toBeTypeOf('string');
  });
});
