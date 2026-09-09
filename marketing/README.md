# Marketing material

Customer-facing collateral for Campaign Buddy (CampaignBuddy.lk), maintained by
Dyro Technologies. All pieces share one visual system: orange (`#FF7A33`) and ink
(`#12241F`), Poppins for display, a system stack for body text. Each is a single
self-contained HTML file with inline CSS and JS and no build step; the only
external request is the Poppins webfont, with a system-font fallback.

| Path | Piece | Audience | Format |
|---|---|---|---|
| `landing-site/` | One-page website | Agencies and their sponsors | Responsive web page |
| `capability-brief.html` | 12-page evaluation brief | Decision makers doing due diligence | Print-ready A4, screen-viewable |
| `training/` | Step-by-step user guides, one per login | Admin, supervisor, sponsor, promoter | Responsive web guides with real screenshots |

## capability-brief.html

Functional specification, three day-to-day operational scenarios, the data model,
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

## Preview locally

```bash
cd marketing && python -m http.server 8080
```

Then open <http://localhost:8080/capability-brief.html>,
<http://localhost:8080/landing-site/> or <http://localhost:8080/training/>.
