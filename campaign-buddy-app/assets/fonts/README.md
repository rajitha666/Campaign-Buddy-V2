# Fonts go here

This sandbox has no network access, so the actual Poppins `.ttf` binary
files couldn't be downloaded and included in this scaffold.

Download these two weights from Google Fonts (free, OFL license) and drop
them directly in this folder before running the app — `App.tsx` already
points at these exact filenames:

- `Poppins-SemiBold.ttf`
- `Poppins-Bold.ttf`

https://fonts.google.com/specimen/Poppins

Until these files exist, `App.tsx`'s `Font.loadAsync()` call will throw on
startup — that's intentional (fail loudly rather than silently fall back to
a system font and drift from the design system).
