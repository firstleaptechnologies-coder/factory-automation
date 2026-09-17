#!/usr/bin/env node
// Point the binary at the right manifest host and channel, BEFORE archiving.
//
//   node scripts/configure-ota-target.js development   # TestFlight / Play internal
//   node scripts/configure-ota-target.js production    # App Store / Play production
//
// Both live in the native files, which is the point: they are baked into the
// binary, so an over-the-air update cannot move a shop's app onto a different
// server. Changing either is a store release, never an update.
//
// Edits ios/Expo.plist, android/app/src/main/AndroidManifest.xml and
// android/app/src/main/res/values/strings.xml in place. Idempotent — run it
// twice and the second run changes nothing.
//
// The hosts come from deploy/environments.json so there is one list of them in
// the repository, not two that drift.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');

const environments = JSON.parse(
  fs.readFileSync(path.join(repo, 'deploy', 'environments.json'), 'utf8'),
);

/** channel -> the environment that serves it. */
const BY_CHANNEL = Object.fromEntries(
  Object.entries(environments)
    .filter(([key]) => !key.startsWith('_'))
    .map(([, env]) => [env.otaChannel, env]),
);

const channel = process.argv[2];
const environment = BY_CHANNEL[channel];
if (!environment) {
  console.error(
    `usage: configure-ota-target.js <${Object.keys(BY_CHANNEL).join('|')}>`,
  );
  process.exit(1);
}
const url = `https://${environment.apiDomain}/api/updates/manifest`;

/** Any manifest URL we have ever written, so a re-point replaces rather than appends. */
const ANY_URL = /https?:\/\/[^<"\s]+\/api\/updates\/manifest/g;

function edit(relative, change) {
  const file = path.join(root, relative);
  const before = fs.readFileSync(file, 'utf8');
  const after = change(before);
  if (after !== before) fs.writeFileSync(file, after);
  return after !== before;
}

const changed = [];

if (edit('ios/Expo.plist', (s) =>
  s.replace(ANY_URL, url).replace(
    /(<key>expo-channel-name<\/key>\s*<string>)[^<]*(<\/string>)/,
    `$1${channel}$2`,
  ),
)) changed.push('ios/Expo.plist');

if (edit('android/app/src/main/AndroidManifest.xml', (s) => s.replace(ANY_URL, url)))
  changed.push('android/AndroidManifest.xml');

if (edit('android/app/src/main/res/values/strings.xml', (s) =>
  s.replace(/("expo-channel-name":")[^"]*(")/, `$1${channel}$2`),
)) changed.push('android/strings.xml');

console.log(
  changed.length
    ? `OTA target -> ${channel} (${url})\n  changed: ${changed.join(', ')}`
    : `OTA target already ${channel} (${url}) — nothing to change`,
);
