# Marketing material

Customer-facing collateral for Campaign Buddy (CampaignBuddy.lk), maintained by
Dyro Technologies. All pieces share one visual system: orange (`#FF7A33`) and ink
(`#12241F`), Poppins for display, a system stack for body text. Each is a single
self-contained HTML file with inline CSS and JS and no build step; the only
external request is the Poppins webfont, with a system-font fallback.

| Path | Piece | Audience | Format |
|---|---|---|---|
| `landing-site/` | One-page website | Agencies and their sponsors | Responsive web page |
| `capability-brief.html` | 14-page evaluation brief | Decision makers doing due diligence | Print-ready A4, screen-viewable |
| `training/` | Step-by-step user guides, one per login | Admin, supervisor, sponsor, promoter | Responsive web guides with real screenshots |
| `store/` | App Store / Play Store submission assets for CB Mobile | Apple / Google review, store visitors | Listing copy (`app-store-listing.md`) + icons + framed screenshots |
| `campaign-setup-kit/` | New-campaign data collection kit | A new client's team, before their first campaign is created | Guide: print-ready HTML explainer. Workbook: fillable `.xlsx` |

## capability-brief.html

Functional specification, three day-to-day operational scenarios, a two-page CB Intelligence (AI assistant + agents) outlook, the data model,
and the commercial model, for buyers who want the detail before deciding. Open it
in a browser; on screen the pages render as a stack of A4 cards with a "Save as
PDF" button (or use the browser's print dialog) to produce the shareable PDF.

The sample campaign used throughout ("Radiance Q3 Push", "Nawala Retail Outlet",
promoter names) is illustrative and labelled as such on page 2. Real contact
details (Dyro Technologies, +94 71 218 4846) are in place; the contact email is
still `hello@campaignbuddy.lk` as a placeholder.

A slide-deck version of the same content is planned and will land here next.

## training/

Four task-based web guides (`admin.html`, `supervisor.html`, `sponsor.html`,
`promoter.html`) plus an `index.html` role picker, with a real screenshot of
every step. Shared `assets/guide.css` + `assets/guide.js` (sticky contents with
scroll-spy, collapsible sections, click-to-zoom images, mobile drawer). See
`training/README.md`.

The screenshots were captured against a locally running instance seeded with
**`campaign-buddy-backend/prisma/demo-seed.ts`** — a re-runnable seeder that
builds the "Radiance Q3 Push" sample campaign with roughly a week of activity.
That seeder is also handy on its own for demos and sales walkthroughs.

## store/

App-store listing material for `campaign-buddy-app`. `app-store-listing.md` has
the copy, per-field values, privacy declarations, reviewer notes and developer
account setup for both stores. `store/mobile/` holds the app icon, Android
adaptive-icon foreground, splash mark, and the framed marketing screenshots
(Apple 6.7" and Play phone), rebuilt by `store/gen-icons.js` and
`store/gen-screenshots.js`. See `store/README.md`. Unlike `training/`, these
scripts are committed (they need only `sharp` + `opentype.js`, not a running app).

## campaign-setup-kit/

Handed to a new client so their team can supply everything needed to create
their first campaign, before they have a portal login. `campaign-setup-workbook.xlsx`
is the thing they actually fill in — 12 tabs (Client, Brands, Products, Campaign,
Outlets, Distributor Points, Field Staff, Activations, Targets, Custom
Fields, Portal Logins, Notes) plus a "Start Here" cover tab, with dropdown
validation on enum-like columns (role, target type, field type, etc.), rebuilt
by `campaign-setup-kit/gen-workbook.js` (needs only `exceljs`, not a running
app — like `store/`'s scripts, this one is committed). `campaign-setup-guide.html`
is a companion explainer, in the same section order as the workbook's tabs,
saying what each field means, why it's asked for, and what's genuinely
optional vs required to get started (most things are editable later from the
portal once the Campaign Admin login exists, so the bar for "required now" is
deliberately low). See `campaign-setup-kit/README.md`. There's no shared
source between the guide and the workbook — keep them in sync by hand.

## Preview locally

```bash
cd marketing && python -m http.server 8080
```

Then open <http://localhost:8080/capability-brief.html>,
<http://localhost:8080/landing-site/>, <http://localhost:8080/training/> or
<http://localhost:8080/campaign-setup-kit/campaign-setup-guide.html>.
