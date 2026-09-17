#!/bin/sh
# Inject PWA head tags into Expo's exported index.html. Runs in the web image
# build (see Dockerfile.web) — Expo's SPA export emits no PWA head tags.
set -eu
INDEX=/usr/share/nginx/html/index.html
sed -i \
  -e 's|<meta charset="utf-8" />|<meta charset="utf-8" />\n    <meta name="apple-mobile-web-app-capable" content="yes" />\n    <meta name="apple-mobile-web-app-status-bar-style" content="black" />\n    <meta name="apple-mobile-web-app-title" content="Campaign Buddy" />\n    <meta name="theme-color" content="#FF7A33" />|' \
  -e 's|</head>|<link rel="apple-touch-icon" href="/apple-touch-icon.png"/>\n    <link rel="manifest" href="/pwa-manifest.webmanifest"/>\n  </head>|' \
  "$INDEX"
grep -q 'apple-touch-icon' "$INDEX"
