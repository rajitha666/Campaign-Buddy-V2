# App store submission assets, CB Mobile

Everything for the App Store and Play Store listings of `campaign-buddy-app`.
Listing copy and field-by-field values live in
[`../app-store-listing.md`](../app-store-listing.md); this folder holds the images
and the scripts that build them.

## Contents

```
app-store-listing.md        (in ../)  copy, metadata, privacy, review notes, account setup
store/
  gen-icons.js              builds the app icon / adaptive icon / splash / favicon
  gen-screenshots.js        builds the framed marketing screenshots
  mobile/
    icon.png                1024x1024, no alpha  (iOS app icon, also the source for EAS)
    adaptive-icon.png       1024x1024 foreground (Android, on a #FF7A33 field)
    splash-icon.png         1024x1024 white mark on transparent (shown on #12241F)
    play-store-icon-512.png 512x512  (Play Console "App icon")
    favicon is written by gen-icons.js but only used by the web build
    screenshots/
      apple-6.7/            7x  1290 x 2796   (iPhone 6.7") 
      play-phone/           7x  1080 x 2160   (Play phone, 2:1)
```

The four icon/splash PNGs are also committed where the app build reads them:
`campaign-buddy-app/assets/images/` (wired up in `campaign-buddy-app/app.json`).

## The screenshot set

Same seven screens, same order, both stores. Source captures are the field-rep
screenshots in `../training/assets/mobile-promoter/` (campaign "Radiance Q3
Push", promoter Kasun). Captions follow the house style (no dashes).

| # | Screen | Caption | Subcaption |
|---|---|---|---|
| 1 | Check-in | GPS **check-in** at the outlet | Your location is verified when the shift starts |
| 2 | Home | Your whole shift, one **screen** | Sales, stock and footfall as the day runs |
| 3 | Update stock | **Stock and sales** per product | Remaining count updates live, flag a reorder in a tap |
| 4 | Daily sales | **Confirm the day** before checkout | Footfall, conversion and what moved the numbers |
| 5 | Products | Every SKU, **tracked live** | Sold against opening stock, per outlet, per day |
| 6 | Performance | See how you're **tracking** | Sales, best day and top products for the campaign |
| 7 | Attendance | **On time,** and it shows | Every check-in timed against the planned shift |

Login and Time-off screens were left out: the login capture still shows the old
"Dyuro" spelling (fixed in the app since, commit `70163e9`) and needs a re-capture;
the Time-off screen has too much empty space and a declined request.

## Rebuilding

Needs Node and two packages that are not in the repo:

```bash
cd marketing/store
npm i sharp opentype.js
node gen-icons.js                 # writes ./out/, then copy the four PNGs into
                                  # campaign-buddy-app/assets/images/ and mobile/
node gen-screenshots.js           # writes straight into mobile/screenshots/
```

`gen-screenshots.js` reads the Poppins 700/500 TTFs from
`campaign-buddy-app/node_modules/@expo-google-fonts/poppins/`, so run
`npm install` in the app first (or point the script elsewhere).

To change a caption, edit the `SLIDES` array at the top of `gen-screenshots.js`.
`*word*` renders that word in mango. To use different source screenshots, re-run
the training capture harness (see `../training/README.md`) and swap the files in
`../training/assets/mobile-promoter/`.

### Note on `gen-screenshots.js`

Text is drawn by walking the opentype.js glyph path commands and emitting the SVG
`d` string directly. opentype's own `Path.toPathData()` / `toSVG()` produce
strings that the sharp/resvg rasteriser mis-renders (dropped or point-reflected
glyphs). Keep the hand-rolled `pathD()` serialiser.

## Still outstanding

- Google Play **feature graphic** (1024 x 500). Not built yet.
- Re-capture the login screen (Dyuro to Dyro) if it is added to the set.
- The source captures contain demo product names with an em dash
  ("Sulfate Free Shampoo — Lavender 320ml") from `prisma/demo-seed.ts`. Cosmetic,
  but re-seed + re-capture if it should match the house no-dash style.
- A privacy policy page for `campaignbuddy.lk/privacy` (blocks both submissions).
