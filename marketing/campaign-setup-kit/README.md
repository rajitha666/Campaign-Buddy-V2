# Campaign setup kit

Handed to a new client so their team can supply everything needed to create
their first campaign, before they have a portal login.

| File | Role |
|---|---|
| `campaign-setup-workbook.xlsx` | What the client actually fills in — 12 tabs (Client, Brands, Products, Campaign, Outlets, Distributor Points, Field Staff, Activations, Targets, Custom Fields, Portal Logins, Notes), plus a "Start Here" cover tab. Dropdown validation on enum-like columns (role, target type, field type, etc.). |
| `campaign-setup-guide.html` | Companion explainer, same section order as the workbook's tabs — what each field means, why it's asked for, and what's genuinely optional vs required (most things stay editable later from the portal, so the bar for "required now" is deliberately low). Print-ready. |
| `gen-workbook.js` | Rebuilds the workbook. |

## Rebuilding the workbook

```bash
cd marketing/campaign-setup-kit && npm i exceljs && node gen-workbook.js
```

There's no shared source between the workbook and the guide — if you change
a field, label, or section in one, update the other by hand.
