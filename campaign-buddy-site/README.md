# Campaign Buddy — marketing site

The one-page sales and marketing site for **CampaignBuddy.lk**. Audience: field-marketing
agencies (the buyer) and their brand sponsors.

Single self-contained file. No build step, no dependencies, no framework. All CSS and JS
are inline in `index.html`; the only external request is the Poppins webfont from Google
Fonts (with a system-font fallback if it is blocked).

## Structure

| File | What it is |
|---|---|
| `index.html` | The entire site — markup, styles, and a small script for the mobile menu and the pilot form |

## Preview locally

Any static file server works, for example:

```bash
cd campaign-buddy-site && python -m http.server 8080
```

Then open <http://localhost:8080>. Opening `index.html` directly with `file://` also works.

## Deploy

Copy the folder to any static host (Netlify, Cloudflare Pages, S3, an nginx `root`, etc.).
There is nothing to compile.

To serve it from the existing Docker setup, add a static service to `docker-compose.yml`:

```yaml
  site:
    image: nginx:alpine
    volumes:
      - ./campaign-buddy-site:/usr/share/nginx/html:ro
    ports:
      - "8082:80"
```

## Before going live — fill in the placeholders

Everything shown in orange on the page (class `placeholder`) is a stand-in:

- **Contact email** — currently `hello@campaignbuddy.lk` (in three `mailto:` links and the JS)
- **WhatsApp number** — currently `+94 76 000 0000`; the click-to-chat link is built from
  the `WA_NUMBER` constant (`94760000000`) near the bottom of the inline script
- **Legal entity name** — currently `Campaign Buddy (Pvt) Ltd` in the footer

The pilot form has no backend. On submit it composes a `mailto:` to the contact address.
Swap in a real form endpoint (Formspree, a Worker, an API route) in the script's submit
handler if you want submissions captured server-side.

## Notes

- **Product screens** in the page are faithful HTML rebuilds of the CB Office and CB Mobile
  prototypes (`docs/admin-portal-prototype.html`, `docs/archive/prototype-v2.html`), using
  the product's own colour tokens and sample data. They are not screenshots, so they stay
  crisp and theme-consistent at any size.
- The **live-locations map** uses a hand-drawn schematic street basemap (inline SVG). Real
  map tiles were not an option in the earlier Artifact preview; here you can replace it with
  a real Leaflet + OpenStreetMap map (the CB Office portal already uses Leaflet) or a static
  Mapbox / MapTiler image if you prefer.
- The **AI section** is deliberately framed as direction, not shipping features.
- All figures are illustrative and labelled as such.
