import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * A release build must not be signed with the debug key.
 *
 * The React Native template ships `release` pointing at `signingConfigs.debug`
 * with a comment telling you to fix it, which is exactly the kind of
 * instruction a project carries for a year. It is also invisible: a
 * debug-signed bundle builds cleanly, uploads, and is refused by Play days
 * later with a message about a certificate. And if one were ever accepted, the
 * debug key — whose password is the literal string "android", in this file, in
 * every React Native project on earth — becomes the app's identity on Play and
 * cannot be changed afterwards.
 *
 * Nothing else in this repository would notice. Gradle is not built here and
 * not covered by any other test, so the file is read as text, the way the
 * keyboard rails read the screens.
 */
const gradle = readFileSync(
  join(__dirname, '..', '..', 'android', 'app', 'build.gradle'),
  'utf8',
);

/** The body of one block, so an assertion cannot match its neighbour's. */
function block(header: string): string {
  const at = gradle.indexOf(header);
  expect(at).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = at; i < gradle.length; i += 1) {
    if (gradle[i] === '{') depth += 1;
    if (gradle[i] === '}') {
      depth -= 1;
      if (depth === 0) return gradle.slice(at, i + 1);
    }
  }
  throw new Error(`unterminated block: ${header}`);
}

describe('the release build', () => {
  const release = () => block('release {\n            signingConfig');

  it('is not signed with the debug key', () => {
    expect(release()).not.toMatch(/signingConfigs\.debug/);
  });

  it('is signed with the upload key', () => {
    expect(release()).toMatch(/signingConfig signingConfigs\.release/);
  });

  it('takes that key from the environment rather than the repository', () => {
    // A keystore committed here is a signing identity everybody with the
    // repository holds.
    expect(gradle).toMatch(/System\.getenv\("ANDROID_KEYSTORE_PASSWORD"\)/);
    expect(gradle).toMatch(/System\.getenv\("ANDROID_KEY_ALIAS"\)/);
    expect(gradle).toMatch(/System\.getenv\("ANDROID_KEY_PASSWORD"\)/);
  });

  it('refuses to build at all when the upload key is missing', () => {
    // Rather than quietly falling back to debug, which is the failure this
    // whole file exists to prevent.
    expect(gradle).toMatch(/throw new GradleException/);
    expect(gradle).toMatch(/signed with the debug key and/);
  });

  it('still lets an ordinary debug build run without any of it', () => {
    // Somebody running the app on their own machine has no upload key and
    // should not need one.
    expect(gradle).toMatch(/if \(keystore\.exists\(\)\)/);
  });
});

describe('the keystore itself', () => {
  const ignored = readFileSync(join(__dirname, '..', '..', '.gitignore'), 'utf8');

  it('cannot be committed', () => {
    // The workflow writes it as `upload-keystore.jks`, which `*.keystore` does
    // not match — so the pattern that mattered was the one that was missing.
    expect(ignored).toMatch(/^\*\.jks$/m);
    expect(ignored).toMatch(/^\*\.keystore$/m);
  });

  it('still lets the debug keystore through, which is meant to be here', () => {
    expect(ignored).toMatch(/^!debug\.keystore$/m);
  });
});

/**
 * The build number has to reach the bundle.
 *
 * Fastlane passes `versionCode` and `versionName` as Gradle properties, from
 * the same unix-epoch-minutes clock the iOS archive uses. `defaultConfig` had
 * them written out as `1` and `"1.0"`, and Gradle ignores a property nothing
 * reads — so every Android build would have shipped as versionCode 1.
 *
 * Play accepts a versionCode once. The first upload would have worked and the
 * second would have been refused, which is the worst order to discover it in:
 * long after the setup that caused it, and looking like a Play problem.
 */
describe('the build number', () => {
  it('comes from the build rather than from this file', () => {
    expect(gradle).toMatch(/project\.findProperty\("versionCode"\)/);
    expect(gradle).toMatch(/project\.findProperty\("versionName"\)/);
  });

  it('is not pinned to 1', () => {
    expect(gradle).not.toMatch(/^\s*versionCode 1\s*$/m);
    expect(gradle).not.toMatch(/^\s*versionName "1\.0"\s*$/m);
  });

  it('is the same name fastlane passes', () => {
    const fastfile = readFileSync(join(__dirname, '..', '..', 'fastlane', 'Fastfile'), 'utf8');
    // A property read under a different name is a property that is never read.
    expect(fastfile).toMatch(/"versionCode" => BUILD_NUMBER/);
    expect(fastfile).toMatch(/"versionName" => MARKETING_VERSION/);
  });
});
