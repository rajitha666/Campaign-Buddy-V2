/*
 * Builds campaign-setup-workbook.xlsx — the fillable spreadsheet handed to a
 * new client alongside campaign-setup-guide.html. One tab per section of the
 * guide, in the same order, with header styling and dropdown validation
 * matching the Campaign Buddy palette.
 *
 *   cd marketing/campaign-setup-kit && npm i exceljs && node gen-workbook.js
 *
 * Re-run after editing this file to rebuild campaign-setup-workbook.xlsx.
 * Keep the section order/labels here in sync with campaign-setup-guide.html
 * by hand — there's no shared source between the two.
 */
const ExcelJS = require('exceljs');
const path = require('path');

const INK = 'FF12241F';
const MANGO = 'FFFF7A33';
const MANGO_TINT = 'FFFFEEE2';
const SURFACE = 'FFF4F6F3';
const LINE = 'FFE3E7E1';
const TEXT_FAINT = 'FF8A948D';

const wb = new ExcelJS.Workbook();
wb.creator = 'Campaign Buddy';
wb.created = new Date();

function styleHeaderRow(row, reqCols = []) {
  row.eachCell((cell, colNumber) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } };
    cell.alignment = { vertical: 'middle', wrapText: true };
    cell.border = { bottom: { style: 'medium', color: { argb: MANGO } } };
  });
  row.height = 30;
}

function addNoteRow(ws, text, span) {
  const r = ws.addRow([text]);
  ws.mergeCells(r.number, 1, r.number, span);
  r.getCell(1).font = { italic: true, color: { argb: 'FF5C6862' }, size: 10 };
  r.getCell(1).alignment = { wrapText: true, vertical: 'middle' };
  r.height = 30;
  return r;
}

function addTitle(ws, title, subtitle, span) {
  const r1 = ws.addRow([title]);
  ws.mergeCells(r1.number, 1, r1.number, span);
  r1.getCell(1).font = { bold: true, size: 14, color: { argb: INK } };
  r1.height = 22;
  if (subtitle) {
    const r2 = ws.addRow([subtitle]);
    ws.mergeCells(r2.number, 1, r2.number, span);
    r2.getCell(1).font = { italic: true, size: 10, color: { argb: 'FF5C6862' } };
    r2.getCell(1).alignment = { wrapText: true };
    r2.height = 28;
  }
  ws.addRow([]);
}

function setupSheet(ws) {
  ws.views = [{ state: 'frozen', ySplit: ws._headerRowIndex || 0 }];
  ws.properties.defaultRowHeight = 20;
}

function dataRows(ws, headerRowNumber, count, colCount) {
  for (let i = 0; i < count; i++) {
    const row = ws.getRow(headerRowNumber + 1 + i);
    for (let c = 1; c <= colCount; c++) {
      const cell = row.getCell(c);
      cell.border = {
        top: { style: 'thin', color: { argb: LINE } },
        bottom: { style: 'thin', color: { argb: LINE } },
        left: { style: 'thin', color: { argb: LINE } },
        right: { style: 'thin', color: { argb: LINE } },
      };
      if (c === 1) {
        cell.value = i + 1;
        cell.font = { color: { argb: TEXT_FAINT }, size: 10 };
        cell.alignment = { horizontal: 'center' };
      }
    }
    row.height = 22;
    row.commit();
  }
}

function addDropdown(ws, colLetter, fromRow, toRow, options) {
  for (let r = fromRow; r <= toRow; r++) {
    ws.getCell(`${colLetter}${r}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`"${options.join(',')}"`],
      showErrorMessage: true,
      errorTitle: 'Invalid entry',
      error: `Please choose one of: ${options.join(', ')}`,
    };
  }
}

// ---------------------------------------------------------------------------
// 0. Instructions
// ---------------------------------------------------------------------------
{
  const ws = wb.addWorksheet('Start Here', { properties: { tabColor: MANGO } });
  ws.columns = [{ width: 4 }, { width: 100 }];
  ws.mergeCells('A1:B1');
  ws.getCell('A1').value = 'Campaign Buddy — Campaign Setup Workbook';
  ws.getCell('A1').font = { bold: true, size: 18, color: { argb: INK } };
  ws.getRow(1).height = 30;

  ws.mergeCells('A2:B2');
  ws.getCell('A2').value = 'Fill in the tabs below with your campaign details, then send this file back to your Campaign Buddy contact.';
  ws.getCell('A2').font = { size: 11, color: { argb: 'FF5C6862' } };
  ws.getRow(2).height = 24;

  ws.addRow([]);

  const intro = [
    ['How to use this workbook', ''],
    ['', 'Each tab covers one part of your campaign — company details, brands, products, outlets, staff, and so on. Fill in whatever you have now; anything left blank can be added later once your Campaign Admin login is ready.'],
    ['', 'Fields marked with * are required to get the campaign started. Everything else is optional at setup and can be filled in from the CB Office portal afterwards.'],
    ['', 'A companion PDF ("Campaign Setup Guide") explains what each field means and why we ask for it — keep it open alongside this workbook if anything is unclear.'],
    ['', 'Cells with a dropdown arrow have a fixed list of choices — click the cell and pick from the list rather than typing your own value.'],
    ['', "Add as many rows as you need in any tab — the formatting will extend automatically. Don't worry about getting every column perfect; we'll confirm details with you before go-live."],
    ['', ''],
    ['Tabs in this workbook', ''],
    ['1. Client', 'Your company / organisation details'],
    ['2. Brands', 'Brand(s) this campaign covers'],
    ['3. Products', 'Items to be sold / stock-checked'],
    ['4. Campaign', 'Campaign name, dates and seat limits'],
    ['5. Outlets', 'Stores / locations where staff will work'],
    ['6. Distributor Points', 'Optional — warehouse / distributor restock points'],
    ['7. Field Staff', 'Promoters & supervisors who will use the mobile app'],
    ['8. Activations', 'Which staff member works which outlet, and when'],
    ['9. Targets', 'Sales targets per activation (optional at setup)'],
    ['10. Custom Fields', 'Optional — extra questions on the daily report'],
    ['11. Portal Logins', 'Campaign Admin & Sponsor accounts for CB Office'],
    ['12. Notes', 'Anything else we should know'],
  ];
  intro.forEach(([a, b], idx) => {
    const r = ws.addRow([a, b]);
    if (idx === 0 || a === 'Tabs in this workbook') {
      r.getCell(1).font = { bold: true, size: 12, color: { argb: INK } };
      ws.mergeCells(r.number, 1, r.number, 2);
    } else if (a && b === '') {
      // wrapped note line under a heading, but "a" holds a sentence in column A merged
    } else if (a === '' && b) {
      r.getCell(2).alignment = { wrapText: true, vertical: 'middle' };
      r.getCell(2).font = { size: 10.5, color: { argb: 'FF23413A' } };
      ws.mergeCells(r.number, 2, r.number, 2);
      r.height = 34;
    } else if (a && b) {
      r.getCell(1).font = { bold: true, size: 10.5, color: { argb: 'FFE8641F' } };
      r.getCell(2).font = { size: 10.5 };
      r.getCell(2).alignment = { wrapText: true };
    }
  });

  ws.addRow([]);
  const contact = ws.addRow(['Questions?', 'hello@campaignbuddy.lk  ·  +94 71 218 4846  ·  Dyro Technologies']);
  contact.getCell(1).font = { bold: true, size: 10.5 };
  contact.getCell(2).font = { size: 10.5, color: { argb: 'FF5C6862' } };
}

// ---------------------------------------------------------------------------
// 1. Client
// ---------------------------------------------------------------------------
{
  const ws = wb.addWorksheet('1. Client', { properties: { tabColor: MANGO } });
  ws.columns = [{ width: 26 }, { width: 50 }];
  addTitle(ws, 'About your organisation', 'One record per client. If Campaign Buddy already manages another campaign for you, just tell us the company name below — we\'ll attach this new campaign to your existing record.', 2);

  const fields = [
    ['Company name *', ''],
    ['Primary contact person *', ''],
    ['Contact number', ''],
    ['Email', ''],
    ['Business address', ''],
  ];
  const headerRow = ws.addRow(['Field', 'Your answer']);
  styleHeaderRow(headerRow);
  fields.forEach(([label]) => {
    const r = ws.addRow([label, '']);
    r.getCell(1).font = { bold: true, size: 10.5 };
    r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SURFACE } };
    r.getCell(2).border = { bottom: { style: 'thin', color: { argb: LINE } } };
    r.height = 22;
  });
}

// ---------------------------------------------------------------------------
// 2. Brands
// ---------------------------------------------------------------------------
{
  const ws = wb.addWorksheet('2. Brands', { properties: { tabColor: MANGO } });
  ws.columns = [{ width: 6 }, { width: 30 }, { width: 50 }];
  addTitle(ws, 'Brands', 'Which brand(s) does this campaign cover? A campaign can promote items from one or more brands under the same company.', 3);
  const headerRow = ws.addRow(['#', 'Brand name *', 'Notes']);
  styleHeaderRow(headerRow);
  const hr = headerRow.number;
  dataRows(ws, hr, 8, 3);
}

// ---------------------------------------------------------------------------
// 3. Products
// ---------------------------------------------------------------------------
{
  const ws = wb.addWorksheet('3. Products', { properties: { tabColor: MANGO } });
  ws.columns = [{ width: 6 }, { width: 20 }, { width: 16 }, { width: 28 }, { width: 16 }, { width: 14 }, { width: 20 }, { width: 26 }];
  addTitle(ws, 'Products to track', 'Every item promoters will sell or stock-check. SKU / code can be your own product code — we\'ll generate one if you don\'t have it. Product photos can be added later in the portal.', 8);
  const headerRow = ws.addRow(['#', 'Brand *', 'SKU / code', 'Product name *', 'Unit price (LKR)', 'Reorder level', 'Supplier', 'Description']);
  styleHeaderRow(headerRow);
  const hr = headerRow.number;
  dataRows(ws, hr, 20, 8);
}

// ---------------------------------------------------------------------------
// 4. Campaign
// ---------------------------------------------------------------------------
{
  const ws = wb.addWorksheet('4. Campaign', { properties: { tabColor: MANGO } });
  ws.columns = [{ width: 30 }, { width: 50 }];
  addTitle(ws, 'Campaign details', 'One workbook = one campaign. If you\'re setting up more than one campaign at once, use a separate copy of this workbook for each.', 2);

  const headerRow = ws.addRow(['Field', 'Your answer']);
  styleHeaderRow(headerRow);
  const fields = [
    'Campaign name *',
    'Description (optional)',
    'Start date * (yyyy-mm-dd)',
    'End date * (yyyy-mm-dd)',
    'Timezone (default: Asia/Colombo)',
    'Promoter seat limit (default: 20)',
    'Supervisor seat limit (default: 5)',
    'Admin seat limit (default: 2)',
    'Sponsor seat limit (default: 2)',
  ];
  fields.forEach((label) => {
    const r = ws.addRow([label, '']);
    r.getCell(1).font = { bold: true, size: 10.5 };
    r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SURFACE } };
    r.getCell(2).border = { bottom: { style: 'thin', color: { argb: LINE } } };
    r.height = 22;
  });
  ws.addRow([]);
  addNoteRow(ws, 'Seat limits only need changing if you expect to exceed the defaults — leave blank to use them. Targets (per-item or per-brand, daily or monthly, unit- or value-based) are set per activation on the "8. Activations" tab.', 2);
}

// ---------------------------------------------------------------------------
// 5. Outlets
// ---------------------------------------------------------------------------
{
  const ws = wb.addWorksheet('5. Outlets', { properties: { tabColor: MANGO } });
  ws.columns = [{ width: 6 }, { width: 26 }, { width: 20 }, { width: 32 }, { width: 18 }, { width: 16 }, { width: 16 }, { width: 12 }];
  addTitle(ws, 'Outlets / stores', 'Every location a promoter or supervisor will be stationed at. Exact map pin can be dropped later by your Campaign Admin — an address and city is enough for now.', 8);
  const headerRow = ws.addRow(['#', 'Outlet name *', 'Contact person', 'Address *', 'City / town *', 'Phone', 'Mobile', 'Geofence radius (m)']);
  styleHeaderRow(headerRow);
  const hr = headerRow.number;
  dataRows(ws, hr, 20, 8);
  ws.getColumn(8).eachCell((cell, rowNumber) => {
    if (rowNumber > hr) cell.numFmt = '0';
  });
}

// ---------------------------------------------------------------------------
// 6. Distributor Points
// ---------------------------------------------------------------------------
{
  const ws = wb.addWorksheet('6. Distributor Points', { properties: { tabColor: MANGO } });
  ws.columns = [{ width: 6 }, { width: 28 }, { width: 20 }, { width: 32 }, { width: 18 }];
  addTitle(ws, 'Distributor / warehouse points', 'Optional. Only needed if activations restock from a distributor rather than the outlet\'s own store room. Leave blank if not applicable.', 5);
  const headerRow = ws.addRow(['#', 'Name', 'Contact', 'Address', 'City']);
  styleHeaderRow(headerRow);
  const hr = headerRow.number;
  dataRows(ws, hr, 8, 5);
}

// ---------------------------------------------------------------------------
// 7. Field Staff
// ---------------------------------------------------------------------------
{
  const ws = wb.addWorksheet('7. Field Staff', { properties: { tabColor: MANGO } });
  ws.columns = [{ width: 6 }, { width: 26 }, { width: 14 }, { width: 16 }, { width: 18 }, { width: 26 }];
  addTitle(ws, 'Promoters & supervisors', 'Anyone who will use the CB Mobile app on the ground. Employee ID and password are generated when the account is created — you only need to tell us who they are. NIC, date of birth, address, emergency contact and bank details can be filled in later from each person\'s Staff Profile in the portal.', 6);
  const headerRow = ws.addRow(['#', 'Full name *', 'Role *', 'Mobile number', 'Based in (city)', 'Reports to (supervisor, for promoters)']);
  styleHeaderRow(headerRow);
  const hr = headerRow.number;
  dataRows(ws, hr, 30, 6);
  addDropdown(ws, 'C', hr + 1, hr + 30, ['Promoter', 'Supervisor']);
}

// ---------------------------------------------------------------------------
// 8. Activations
// ---------------------------------------------------------------------------
{
  const ws = wb.addWorksheet('8. Activations', { properties: { tabColor: MANGO } });
  ws.columns = [
    { width: 6 }, { width: 22 }, { width: 20 }, { width: 20 }, { width: 20 },
    { width: 20 }, { width: 14 }, { width: 14 }, { width: 16 },
    { width: 16 }, { width: 16 }, { width: 16 },
  ];
  addTitle(ws, 'Activations', 'One row per promoter assigned to an outlet for a date range — this is what appears on the mobile app and the field calendar. The last three columns only need filling in where an activation should differ from the campaign default.', 12);
  const headerRow = ws.addRow([
    '#', 'Activation name', 'Outlet *', 'Promoter *', 'Supervisor', 'Distributor point',
    'Start date *', 'End date *', 'Shift start', 'Shift end',
    'Target type (default: Per item)', 'Target period (default: Daily)',
  ]);
  styleHeaderRow(headerRow);
  const hr = headerRow.number;
  dataRows(ws, hr, 20, 12);
  addDropdown(ws, 'K', hr + 1, hr + 20, ['Per item', 'Per brand overall']);
  addDropdown(ws, 'L', hr + 1, hr + 20, ['Daily', 'Monthly']);
}

// ---------------------------------------------------------------------------
// 9. Targets
// ---------------------------------------------------------------------------
{
  const ws = wb.addWorksheet('9. Targets', { properties: { tabColor: MANGO } });
  ws.columns = [{ width: 6 }, { width: 26 }, { width: 22 }, { width: 14 }, { width: 16 }, { width: 22 }, { width: 14 }];
  addTitle(ws, 'Sales targets', 'Optional at setup — targets can be added or adjusted from the portal at any time once activations are running.', 7);
  const headerRow = ws.addRow(['#', 'Activation / outlet', 'Product or brand', 'Target value', 'Measured in', 'Period (from – to)', 'Repeats each period?']);
  styleHeaderRow(headerRow);
  const hr = headerRow.number;
  dataRows(ws, hr, 15, 7);
  addDropdown(ws, 'E', hr + 1, hr + 15, ['Units sold', 'Sales value (LKR)']);
  addDropdown(ws, 'G', hr + 1, hr + 15, ['No', 'Yes']);
}

// ---------------------------------------------------------------------------
// 10. Custom Fields
// ---------------------------------------------------------------------------
{
  const ws = wb.addWorksheet('10. Custom Fields', { properties: { tabColor: MANGO } });
  ws.columns = [{ width: 6 }, { width: 28 }, { width: 16 }, { width: 18 }, { width: 30 }, { width: 12 }];
  addTitle(ws, 'Extra fields for daily reports', 'Optional. Beyond the standard sales and stock numbers, do you need promoters to record anything else each day (e.g. "competitor price seen", "display compliant Y/N")? Leave blank if the standard report is enough.', 6);
  const headerRow = ws.addRow(['#', 'Field label', 'Type', 'Captured per', 'Dropdown options (comma separated)', 'Required?']);
  styleHeaderRow(headerRow);
  const hr = headerRow.number;
  dataRows(ws, hr, 10, 6);
  addDropdown(ws, 'C', hr + 1, hr + 10, ['Number', 'Text', 'Yes / No', 'Dropdown']);
  addDropdown(ws, 'D', hr + 1, hr + 10, ['Day overall', 'Per product']);
  addDropdown(ws, 'F', hr + 1, hr + 10, ['No', 'Yes']);
}

// ---------------------------------------------------------------------------
// 11. Portal Logins
// ---------------------------------------------------------------------------
{
  const ws = wb.addWorksheet('11. Portal Logins', { properties: { tabColor: MANGO } });
  ws.columns = [{ width: 6 }, { width: 26 }, { width: 28 }, { width: 18 }, { width: 26 }, { width: 34 }];
  addTitle(ws, 'Admin & sponsor logins', 'People who need to log into CB Office (the web portal) rather than the mobile app — your Campaign Admin, and any client-side sponsors who should see reporting. Field staff from "7. Field Staff" do not need an entry here.', 6);
  const headerRow = ws.addRow(['#', 'Full name *', 'Email *', 'Role *', 'Outlet access', 'If "Specific outlets" — list which ones']);
  styleHeaderRow(headerRow);
  const hr = headerRow.number;
  dataRows(ws, hr, 10, 6);
  addDropdown(ws, 'D', hr + 1, hr + 10, ['Campaign Admin', 'Sponsor']);
  addDropdown(ws, 'E', hr + 1, hr + 10, ['All outlets', 'Specific outlets']);
}

// ---------------------------------------------------------------------------
// 12. Notes
// ---------------------------------------------------------------------------
{
  const ws = wb.addWorksheet('12. Notes', { properties: { tabColor: MANGO } });
  ws.columns = [{ width: 100 }];
  addTitle(ws, 'Anything else?', 'Special requirements, go-live date pressure, existing data to migrate, or anything else not covered by the other tabs.', 1);
  for (let i = 0; i < 12; i++) {
    const r = ws.addRow(['']);
    r.height = 22;
    r.getCell(1).border = { bottom: { style: 'thin', color: { argb: LINE } } };
  }
}

const outPath = process.argv[2] || path.join(__dirname, 'campaign-setup-workbook.xlsx');
wb.xlsx.writeFile(outPath).then(() => {
  console.log('written to', outPath);
});
