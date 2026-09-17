import { describe, it, expect, vi, afterEach } from 'vitest';
import { RESOURCES } from './resources';
import { outlets as outletsApi, items as itemsApi, staff as staffApi, users as usersApi, activations as activationsApi } from '../lib/endpoints';

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

  it('staff mobile/contact-phone fields are native tel inputs accepting valid formats', () => {
    const phoneFields = RESOURCES.staff.formFields.filter((f) => f.key === 'phone' || f.key === 'emergencyContactPhone');
    expect(phoneFields.length).toBeGreaterThanOrEqual(2);
    for (const f of phoneFields) {
      expect(f.type, `staff.${f.key}.type`).toBe('tel');
      expect(f.pattern, `staff.${f.key}.pattern`).toBeTypeOf('string');
      for (const sample of ['+94771234567', '+94 71 222 2222', '+94-71-2222222', '0771234567']) {
        expect(new RegExp(`^${f.pattern}$`).test(sample), `staff.${f.key}: ${sample}`).toBe(true);
      }
      expect(new RegExp(`^${f.pattern}$`).test('abc')).toBe(false);
      // typed/local formats normalise to the canonical local SL format before hitting the backend
      expect(f.validate('0771234567')).toBeNull();
      expect(f.validate('+94 71 222 2222')).toBeNull();
      expect(f.validate('abc')).toBeTypeOf('string');
    }
  });

  it('staff create/update payload normalises phone numbers', async () => {
    const spy = vi.spyOn(staffApi, 'create').mockResolvedValue({ data: {} });
    try {
      await RESOURCES.staff.createItem({ values: { employeeId: 'E1', phone: '0771234567', emergencyContactPhone: '94771234567' } });
      expect(spy.mock.calls[0][0].phone).toBe('0771234567');
      expect(spy.mock.calls[0][0].emergencyContactPhone).toBe('0771234567');
    } finally {
      spy.mockRestore();
    }
  });

  it('staff create/update uploads a picked profile photo after saving — issue #29', async () => {
    const createSpy = vi.spyOn(staffApi, 'create').mockResolvedValue({ data: { id: 's_new' } });
    const updateSpy = vi.spyOn(staffApi, 'update').mockResolvedValue({ data: { id: 's_1' } });
    const photoSpy = vi.spyOn(staffApi, 'uploadPhoto').mockResolvedValue({ data: {} });
    try {
      const file = new File(['x'], 'me.jpg', { type: 'image/jpeg' });
      // no photo picked → no upload call
      await RESOURCES.staff.createItem({ values: { employeeId: 'E1' } });
      expect(photoSpy).not.toHaveBeenCalled();
      // photo picked → uploaded against the created/updated staff id
      await RESOURCES.staff.createItem({ values: { employeeId: 'E2', image: file } });
      expect(photoSpy).toHaveBeenCalledWith('s_new', file);
      await RESOURCES.staff.updateItem({ id: 's_1', values: { employeeId: 'E2', image: file } });
      expect(photoSpy).toHaveBeenCalledWith('s_1', file);
    } finally {
      createSpy.mockRestore();
      updateSpy.mockRestore();
      photoSpy.mockRestore();
    }
  });

  it('staff form has a profile photo upload field with a preview — issue #29', () => {
    const field = RESOURCES.staff.formFields.find((f) => f.key === 'image');
    expect(field).toBeDefined();
    expect(field.type).toBe('upload');
    expect(field.previewKey).toBe('profilePictureUrl');
  });

  it('password fields are required on create and resettable (hidden) on edit', () => {
    const pwField = (key) => RESOURCES[key].formFields.find((f) => f.key === 'password');
    for (const key of ['staff', 'users']) {
      const f = pwField(key);
      expect(f, `${key}.password field`).toBeDefined();
      expect(f.required, `${key}.password.required`).toBe(true);
      expect(f.resettable, `${key}.password.resettable`).toBe(true);
    }
  });

  it('staff/users update payloads omit a blank password (keep existing)', async () => {
    const staffSpy = vi.spyOn(staffApi, 'update').mockResolvedValue({ data: {} });
    const usersSpy = vi.spyOn(usersApi, 'update').mockResolvedValue({ data: {} });
    try {
      await RESOURCES.staff.updateItem({ id: 's1', values: { fullName: 'X', password: '', image: null, profilePictureUrl: '/p.jpg' } });
      expect(staffSpy.mock.calls[0][1]).not.toHaveProperty('password');
      await RESOURCES.users.updateItem({ id: 'u1', values: { displayName: 'Y', password: '' } });
      expect(usersSpy.mock.calls[0][1]).not.toHaveProperty('password');
      // a re-typed password still travels
      await RESOURCES.users.updateItem({ id: 'u1', values: { password: 'new-pw' } });
      expect(usersSpy.mock.calls[1][1].password).toBe('new-pw');
    } finally {
      staffSpy.mockRestore();
      usersSpy.mockRestore();
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

  it('no formField or filter uses a plain (non-searchable) select — issue #6', () => {
    for (const [key, cfg] of Object.entries(RESOURCES)) {
      for (const f of [...(cfg.formFields || []), ...(cfg.filters || [])]) {
        expect(f.type, `${key}.${f.key}`).not.toBe('select');
      }
    }
  });

  it('every Promoter/Supervisor dropdown shows "ID - Full Name" — issue #7', async () => {
    const spy = vi.spyOn(staffApi, 'search').mockResolvedValue({
      data: [{ id: 's1', employeeId: 'EMP-0004', fullName: 'Tharindu Jayasuriya', displayName: 'Tharindu', userType: 'promoter' }],
    });
    try {
      const activationStaffField = RESOURCES.activations.formFields.find((f) => f.key === 'staffId');
      const activationSupervisorField = RESOURCES.activations.formFields.find((f) => f.key === 'supervisorStaffId');
      const promoterTrackingField = RESOURCES.promoterTracking.filters.find((f) => f.key === 'staffId');
      const supervisorTrackingField = RESOURCES.supervisorTracking.filters.find((f) => f.key === 'staffId');
      for (const f of [activationStaffField, activationSupervisorField, promoterTrackingField, supervisorTrackingField]) {
        const options = await f.optionsLoader();
        expect(options[0].label).toBe('EMP-0004 - Tharindu Jayasuriya');
      }
    } finally {
      spy.mockRestore();
    }
  });

  it('staff fetchList forwards page/pageSize to GET /staff', async () => {
    const spy = vi.spyOn(staffApi, 'search').mockResolvedValue({ data: [], meta: { total: 0 } });
    try {
      await RESOURCES.staff.fetchList({ query: { page: 2, pageSize: 50, search: 'th' } });
      expect(spy.mock.calls[0][0]).toBe('th');
      expect(spy.mock.calls[0][1].page).toBe(2);
      expect(spy.mock.calls[0][1].pageSize).toBe(50);
    } finally {
      spy.mockRestore();
    }
  });

  it('clientPaged slices full-list endpoints into the requested page', async () => {
    const full = { data: Array.from({ length: 125 }, (_, i) => ({ id: i })), meta: {} };
    const spy = vi.spyOn(activationsApi, 'list').mockResolvedValue(full);
    try {
      const res = await RESOURCES.activations.fetchList({ campaignId: 'c1', query: { page: 3, pageSize: 50 } });
      expect(spy).toHaveBeenCalledWith('c1', { page: 3, pageSize: 50 });
      expect(res.data).toHaveLength(25);
      expect(res.data[0].id).toBe(100);
      expect(res.meta.total).toBe(125);
    } finally {
      spy.mockRestore();
    }
  });

  it('clientPaged preserves meta when present and defaults total to list length', async () => {
    const spy = vi.spyOn(activationsApi, 'list').mockResolvedValue({ data: [{ id: 1 }], meta: { grandTotal: 7 } });
    try {
      const res = await RESOURCES.activations.fetchList({ campaignId: 'c1', query: { page: 2, pageSize: 25 } });
      expect(res.data).toHaveLength(0); // page 2 of a 1-row list
      expect(res.meta.total).toBe(1);
      expect(res.meta.grandTotal).toBe(7);
    } finally {
      spy.mockRestore();
    }
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
