#!/usr/bin/env node
// The single source of truth for the marketing version = apps/mobile/version.json.
//
// Kept OUT of app.json deliberately. app.json is an input to @expo/fingerprint,
// which is what decides whether a change is JS-only or native — so bumping a
// version there would churn the OTA baseline and make every release look like a
// native change. The bare native build reads this through fastlane
// (MARKETING_VERSION) rather than from app.json, so a separate file is both
// correct and fingerprint-neutral.
//
//   node scripts/version.js none              -> print current, change nothing
//   node scripts/version.js patch|minor|major -> bump that part, write, print
//   node scripts/version.js 1.2.3             -> set exactly, write, print
//
// Always prints the resulting version. CI resolves it with a `bump` choice,
// feeds it to fastlane, and post-native-release then sets the same value back
// so the next build starts where this one finished.
const fs = require('fs');
const path = require('path');

const VERSION_FILE = path.resolve(__dirname, '../version.json');
const arg = (process.argv[2] || 'none').trim();

const json = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8'));
const current = json.version || '1.0.0';

function write(value) {
  json.version = value;
  fs.writeFileSync(VERSION_FILE, JSON.stringify(json, null, 2) + '\n');
}

let next = current;
if (/^\d+\.\d+\.\d+$/.test(arg)) {
  // An explicit set, which is how post-native-release persists what shipped.
  next = arg;
  if (next !== current) write(next);
} else {
  let [major, minor, patch] = current.split('.').map((n) => parseInt(n, 10) || 0);
  switch (arg) {
    case 'major': major += 1; minor = 0; patch = 0; break;
    case 'minor': minor += 1; patch = 0; break;
    case 'patch': patch += 1; break;
    case 'none': break;
    default:
      console.error(`version.js: unknown arg '${arg}' (use none|patch|minor|major|x.y.z)`);
      process.exit(1);
  }
  next = `${major}.${minor}.${patch}`;
  if (arg !== 'none' && next !== current) write(next);
}

process.stdout.write(next);
