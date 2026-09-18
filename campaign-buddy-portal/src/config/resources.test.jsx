import { describe, it, expect, vi, afterEach } from 'vitest';
import { RESOURCES } from './resources';
import { outlets as outletsApi, items as itemsApi, staff as staffApi, users as usersApi, activations as activationsApi, reports as reportsApi, campaigns as campaignsApi } from '../lib/endpoints';
import { columnText } from '../lib/columnText';

describe('resources config', () => {
  it('every resource has a title, subtitle and fetchList', () => {
    for (const [key, cfg] of Object.entries(RESOURCES)) {
      expect(cfg.title, `${key}.title`).toBeTypeOf('string');
      expect(cfg.subtitle, `${key}.subtitle`).toBeTypeOf('string');
      expect(cfg.fetchList, `${key}.fetchList`).toBeTypeOf('function');
      // Usually a static array; a resource whose columns depend on the
      // campaign (e.g. per-campaign custom fields) may pass (meta) => columns[].
      expect(Array.isArray(cfg.columns) || typeof cfg.columns === 'function', `${key}.columns`).toBe(true);
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

  it('activations hydrate names from the embedded staff/supervisor/outlet rows, not the active-only staff list', async () => {
    // A deactivated (soft-deleted) promoter drops out of the active-only /staff
    // list, but the activations payload still embeds its staff row — the name
    // must resolve from that relation instead of rendering the raw staffId.
    vi.spyOn(staffApi, 'search').mockResolvedValue({ data: [] });
    vi.spyOn(outletsApi, 'list').mockResolvedValue({ data: [{ id: 'o1', name: 'Test Outlet' }] });
    try {
      const rows = await RESOURCES.activations.hydrate([{
        id: 'a1', outletId: 'o1', staffId: 'f7bac026', supervisorStaffId: null,
        staff: { id: 'f7bac026', fullName: 'Inactive Promoter', displayName: null },
      }]);
      expect(rows[0].outletName).toBe('Test Outlet');
      expect(rows[0].staffName).toBe('Inactive Promoter');
      expect(rows[0].supervisorName).toBeUndefined();
    } finally {
      vi.restoreAllMocks();
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

  it('SKU Wise Sales shows and exports the promoter who logged the sale (portal item 3)', () => {
    const col = RESOURCES.skuSales.columns.find((c) => c.key === 'staffName');
    expect(col).toBeDefined();
    expect(col.label).toBe('Promoter');
    const row = { activationItem: { activation: { staff: { employeeId: 'EMP-0004', fullName: 'Tharindu Jayasuriya' } } } };
    expect(columnText(col, row)).toBe('EMP-0004 - Tharindu Jayasuriya');
    expect(columnText(col, { activationItem: {} })).toBe('—');
  });

  it('SKU Wise Sales ends with a Total Sales column (sold qty × unit price) alongside Promoter (client doc D)', () => {
    const cfg = RESOURCES.skuSales;
    expect(cfg.columns.map((c) => c.key)).toEqual(
      expect.arrayContaining(['itemName', 'outletName', 'staffName', 'date', 'openingStock', 'soldToday', 'totalSales'])
    );
    expect(cfg.columns[cfg.columns.length - 1].key).toBe('totalSales');
    const col = cfg.columns.find((c) => c.key === 'totalSales');
    expect(col.label).toBe('Total Sales');
    const row = { soldToday: 5, activationItem: { campaignItem: { item: { unitPrice: 3200 } } } };
    expect(col.render(row)).toBe('LKR 16,000');
    expect(columnText(col, row)).toBe(16000);
  });

  it('Overall Outlet and SKU Wise shows a Unit Price column (client request)', () => {
    const cfg = RESOURCES.skuSales;
    expect(cfg.title).toBe('Overall Outlet and SKU Wise');
    const col = cfg.columns.find((c) => c.key === 'unitPrice');
    expect(col.label).toBe('Unit Price');
    const row = { activationItem: { campaignItem: { item: { unitPrice: 3200 } } } };
    expect(col.render(row)).toBe('LKR 3,200');
    expect(columnText(col, row)).toBe(3200);
  });

  it('client Brand Wise report shows Sold Qty and Total Sales (client request)', () => {
    const cfg = RESOURCES.brandWiseClient;
    expect(cfg.columns.find((c) => c.key === 'itemCount').label).toBe('Sold Qty');
    expect(cfg.columns.find((c) => c.key === 'totalSales').label).toBe('Total Sales');
  });

  it.each([['brandWiseClient'], ['reportBrandWise']])('%s has Outlet / From / To filters in the header', (key) => {
    const cfg = RESOURCES[key];
    expect(cfg.filters.map((f) => f.key)).toEqual(['outletId', 'dateFrom', 'dateTo']);
    const outlet = cfg.filters.find((f) => f.key === 'outletId');
    expect(outlet.type).toBe('searchable-select');
    expect(outlet.optionsLoader).toBeDefined();
    expect(cfg.filters.filter((f) => f.key === 'dateFrom' || f.key === 'dateTo').every((f) => f.type === 'date' && !f.defaultToday)).toBe(true);
  });

  it('Campaign form has a Tester Field toggle that round-trips through create/edit (client doc D)', async () => {
    const field = RESOURCES.campaigns.formFields.find((f) => f.key === 'testerFieldEnabled');
    expect(field).toBeDefined();
    expect(field.type).toBe('radio');
    expect(RESOURCES.campaigns.editValues({ testerFieldEnabled: true }).testerFieldEnabled).toBe(true);
    expect(RESOURCES.campaigns.editValues({}).testerFieldEnabled).toBe(false);

    const createSpy = vi.spyOn(campaignsApi, 'create').mockResolvedValue({ data: {} });
    const updateSpy = vi.spyOn(campaignsApi, 'update').mockResolvedValue({ data: {} });
    try {
      await RESOURCES.campaigns.createItem({ values: { testerFieldEnabled: true } });
      expect(createSpy.mock.calls[0][0].testerFieldEnabled).toBe(true);
      await RESOURCES.campaigns.updateItem({ id: 'c1', values: { testerFieldEnabled: false } });
      expect(updateSpy.mock.calls[0][1].testerFieldEnabled).toBe(false);
    } finally {
      createSpy.mockRestore();
      updateSpy.mockRestore();
    }
  });

  it('Sales Update Status lists every activation for the day with a three-way completed/pending/absent Status, no Foot Fall (client doc D)', async () => {
    const spy = vi.spyOn(reportsApi, 'salesStatus').mockResolvedValue({
      data: [
        { activationId: 'a1', outletName: 'Outlet A', staffName: 'Kasun', status: 'completed' },
        { activationId: 'a2', outletName: 'Outlet B', staffName: 'Ishara', status: 'pending' },
        { activationId: 'a3', outletName: 'Outlet C', staffName: 'Nadeesha', status: 'absent' },
      ],
    });
    try {
      const cfg = RESOURCES.salesStatus;
      expect(cfg.excel).toBe(true);
      expect(cfg.columns.map((c) => c.key)).toEqual(['outletName', 'staffName', 'status']);

      const statusCol = cfg.columns.find((c) => c.key === 'status');
      expect(columnText(statusCol, { status: 'completed' })).toBe('Completed');
      expect(columnText(statusCol, { status: 'pending' })).toBe('Pending');
      expect(columnText(statusCol, { status: 'absent' })).toBe('Absent');

      const res = await cfg.fetchList({ campaignId: 'c1', query: { date: '2026-09-17' } });
      expect(spy).toHaveBeenCalledWith('c1', { date: '2026-09-17' });
      expect(res.data).toHaveLength(3);
    } finally {
      spy.mockRestore();
    }
  });

  it('Outlet Wise filters by Outlet + From/To (both defaulting to today) and builds columns from meta.customFieldDefs, one row per outlet (client doc D)', async () => {
    const cfg = RESOURCES.outletWise;
    expect(cfg.excel).toBe(true);
    expect(cfg.filters.map((f) => f.key)).toEqual(['outletId', 'dateFrom', 'dateTo']);
    expect(cfg.filters.find((f) => f.key === 'dateFrom').defaultToday).toBe(true);
    expect(cfg.filters.find((f) => f.key === 'dateTo').defaultToday).toBe(true);
    expect(typeof cfg.columns).toBe('function');

    const baseCols = cfg.columns({});
    expect(baseCols.map((c) => c.key)).toEqual(['outletName', 'footFall', 'approached', 'converted', 'totalSales', 'target', 'achievementPct']);
    expect(baseCols.find((c) => c.key === 'outletName').label).toBe('Outlet');
    const conversionCol = baseCols.find((c) => c.key === 'converted');
    expect(columnText(conversionCol, { approached: 40, converted: 10 })).toBe(25);
    expect(columnText(conversionCol, { approached: 0, converted: 0 })).toBe(0);

    // number-type custom field: summed as-is, plain label
    const withNumber = cfg.columns({ customFieldDefs: [{ key: 'samples_given', label: 'Samples Given', type: 'number' }] });
    const numberCol = withNumber.find((c) => c.key === 'samples_given');
    expect(numberCol.label).toBe('Samples Given');
    expect(columnText(numberCol, { samples_given: 7 })).toBe(7);

    // non-number custom field: latest-value-only, label flagged "(current)"
    const withSelect = cfg.columns({ customFieldDefs: [{ key: 'weather', label: 'Weather', type: 'select' }] });
    const selectCol = withSelect.find((c) => c.key === 'weather');
    expect(selectCol.label).toBe('Weather (current)');
    expect(columnText(selectCol, { weather: 'Sunny' })).toBe('Sunny');

    const withBoolean = cfg.columns({ customFieldDefs: [{ key: 'promo', label: 'Promo running?', type: 'boolean' }] });
    const boolCol = withBoolean.find((c) => c.key === 'promo');
    expect(columnText(boolCol, { promo: true })).toBe('Yes');
    expect(columnText(boolCol, { promo: false })).toBe('No');
    expect(columnText(boolCol, {})).toBe('—');

    const spy = vi.spyOn(reportsApi, 'outletWise').mockResolvedValue({
      data: [{ outletId: 'o1', outletName: 'Outlet A', footFall: 10, approached: 4, converted: 1, totalSales: 5000, target: 20, achievementPct: 50 }],
      meta: { customFieldDefs: [] },
    });
    try {
      const res = await cfg.fetchList({ campaignId: 'c1', query: { dateFrom: '2026-09-17', dateTo: '2026-09-17' } });
      expect(spy).toHaveBeenCalledWith('c1', { dateFrom: '2026-09-17', dateTo: '2026-09-17' });
      expect(res.data[0].outletName).toBe('Outlet A');
    } finally {
      spy.mockRestore();
    }
  });

  it('Staff Attendance outlet filter has an "All outlets" clear option', () => {
    const cfg = RESOURCES.staffAttendance;
    const outletFilter = cfg.filters.find((f) => f.key === 'outletId');
    expect(outletFilter.allLabel).toBe('All outlets');
  });

  it('Staff Attendance shows Outlet first, one Promoter name column without the employee-ID code, and time-only check-in/check-out', () => {
    const cfg = RESOURCES.staffAttendance;
    const row = { activation: { staff: { employeeId: 'EMP-0004', fullName: 'Tharindu Jayasuriya', displayName: 'Tharindu' }, outlet: { name: 'Outlet A' } }, checkInAt: '2026-09-17T08:03:45.000Z', checkOutAt: '2026-09-17T17:29:59.000Z' };
    expect(cfg.columns.map((c) => c.key)).toEqual(['outletName', 'staffName', 'date', 'checkInAt', 'checkOutAt', 'status']);
    const nameCol = cfg.columns.find((c) => c.key === 'staffName');
    expect(nameCol.label).toBe('Promoter'); // DataTable swaps this for the campaign's designation label, e.g. "Beauty Advisor"
    expect(columnText(nameCol, row)).toBe('Tharindu Jayasuriya'); // full name — no "EMP-0004 - " code, no duplicate Name column

    const timeRe = /\d{1,2}:\d{2}/;
    const secondsRe = /\d{1,2}:\d{2}:\d{2}/;
    const datePartRe = /\/|\d{4}/;
    for (const key of ['checkInAt', 'checkOutAt']) {
      const col = cfg.columns.find((c) => c.key === key);
      const text = columnText(col, row);
      expect(text).toMatch(timeRe);
      expect(text).not.toMatch(secondsRe);
      expect(text).not.toMatch(datePartRe); // time only — the Date column already carries the day
    }
  });

  it('Promoter Tracking has an "All Promoters" filter option and highlights the clicked row on the map (client doc E)', () => {
    const cfg = RESOURCES.promoterTracking;
    const staffFilter = cfg.filters.find((f) => f.key === 'staffId');
    expect(staffFilter.allLabel).toBe('All Promoters');

    const rows = [{ id: 'p1', staffId: 's1' }];
    const selected = cfg.renderExtra(rows, { id: 'p1', staffId: 's1' });
    expect(selected.props.children.props.highlightedStaffId).toBe('s1');
    expect(selected.props.children.props.highlightedPingId).toBe('p1');

    const none = cfg.renderExtra(rows, null);
    expect(none.props.children.props.highlightedStaffId).toBe(null);
    expect(none.props.children.props.highlightedPingId).toBe(null);
  });

  it('Promoter Tracking table has no Latitude/Longitude columns (shown on the map instead)', () => {
    const cfg = RESOURCES.promoterTracking;
    expect(cfg.columns.some((c) => c.key === 'latitude' || c.key === 'longitude')).toBe(false);
  });

  it('SKU Wise Sales, Supervisor Tracking and Client Reports offer "All" filter options', () => {
    const skuOutlet = RESOURCES.skuSales.filters.find((f) => f.key === 'outletId');
    const supervisor = RESOURCES.supervisorTracking.filters.find((f) => f.key === 'staffId');
    const clientOutlet = RESOURCES.clientReports.filters.find((f) => f.key === 'outletId');
    const outletWiseOutlet = RESOURCES.outletWise.filters.find((f) => f.key === 'outletId');
    expect(skuOutlet.allLabel).toBe('All outlets');
    expect(supervisor.allLabel).toBe('All Supervisors');
    expect(clientOutlet.allLabel).toBe('All outlets');
    expect(outletWiseOutlet.allLabel).toBe('All outlets');
  });
});
