#!/usr/bin/env node
// Monotonic native build number = unix epoch MINUTES.
//
// Always strictly increasing by wall clock, so it needs no shared counter, no
// commit lineage and no coordination between the two platforms — which matters
// because iOS and Android are built by separate workflows that can run in
// either order.
//
// Stays under Android's versionCode cap of 2,100,000,000 for about 3,900 years
// (it is ~29.7M today). Injected at archive time and never committed:
//   iOS:     CURRENT_PROJECT_VERSION=$(node scripts/next-build-number.js)
//   Android: -PversionCode=$(node scripts/next-build-number.js)
process.stdout.write(String(Math.floor(Date.now() / 60000)));
