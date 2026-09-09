# User training

Step-by-step guides for the four people who log in to Campaign Buddy, one HTML
page each. Task-based: every guide is a short list of numbered tasks, each step
with a real screenshot.

| File | Guide | App |
|---|---|---|
| `index.html` | Role picker / landing | |
| `admin.html` | Head office, full access | CB Office |
| `supervisor.html` | Field supervisor, read-only portal + the app | CB Office + CB Mobile |
| `sponsor.html` | Brand sponsor, read-only portal | CB Office |
| `promoter.html` | Field promoter, the shift workflow | CB Mobile |

Shared `assets/guide.css` and `assets/guide.js` (sticky contents with scroll-spy,
collapsible tasks, click-to-zoom screenshots, a mobile contents drawer, a scroll
progress bar). No build step; the only external request is the Poppins webfont.

## Preview / deploy

```bash
cd marketing/training && python -m http.server 8080
```

Serve the folder from any static host. The pages are self-contained apart from the
image folders in `assets/`.

## Screenshots

`assets/portal-admin/`, `assets/portal-supervisor/`, `assets/portal-sponsor/` and
`assets/mobile-promoter/` hold the screenshots (WebP, ~4 MB total). They were
captured against a locally running instance seeded with
**`campaign-buddy-backend/prisma/demo-seed.ts`**, which builds a sample campaign,
"Radiance Q3 Push", with a week of activity:

```bash
cd campaign-buddy-backend && npx ts-node prisma/demo-seed.ts
```

- The Puppeteer capture harness that drives the portal and the Expo web app is
  not in the repo. If a screen changes materially, re-seed, re-shoot that screen,
  resize to WebP, and drop it in `assets/<role>/` under the same name.
- Every screen shows the sample campaign's data. Names ("Sanduni Kumari",
  "Nawala Retail Outlet") and figures are illustrative and flagged as such on
  every page.

## Keeping it current

If a screen changes, replace the matching file in `assets/<role>/` (same name,
`.webp`) and adjust the step text if needed. The guides reference screenshots by
fixed filename, so a straight swap is enough.
