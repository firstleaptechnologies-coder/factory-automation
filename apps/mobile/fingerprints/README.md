# Native fingerprint baselines

One file per channel and platform:

```
development.ios.fingerprint
development.android.fingerprint
production.ios.fingerprint
production.android.fingerprint
```

Each holds the `@expo/fingerprint` hash of the native project **as it was when
that channel's store build was cut**. `.github/workflows/ota-publish.yml`
recomputes the hash on every push and compares:

- **unchanged** — the change is JS-only, so an OTA can carry it;
- **changed** — the native side moved, and no OTA may be published. Handing an
  installed app a JS bundle built against different native code is an app that
  crashes on launch with no way back except the store.

## They are written by CI, not by hand

`post-native-release.yml` writes the baseline after a build is actually
uploaded to a store, and commits it with `[skip ci]`. That ordering is the
whole point: the file means "this runtime is on the store", and only the job
that put it there can honestly say so.

Which is why this directory is empty. No store build has been cut yet, so there
is nothing true to write. Until one is, `ota-publish` will say

> No fingerprint baseline for `<channel>/<platform>` — skip

and publish nothing, which is the correct behaviour rather than a gap.

Writing a baseline by hand to quiet that warning claims a store build exists.
The first OTA would then reach whatever binary people actually have.
