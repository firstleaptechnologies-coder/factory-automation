# Waiting on you

Things only you can do — accounts, credentials and decisions that need a
person. Everything here blocks something specific, and what it blocks is named
so it is obvious what unlocks when you get to it.

*Last updated 8 September 2026.*

---

## 1. React Native 0.87.1 → 0.86.3 — **decided 8 September: pin back**

`expo-updates` needs the Expo modules in the app, and Expo SDK 57 (current)
pins **react-native 0.86.3**. This app is on **0.87.1**.

- **Recommended:** pin back one minor. Momentum Arena runs the same combination
  one version behind (SDK 56 on RN 0.85.2), so it is proven. Reanimated 4 and
  worklets need re-checking after the pin.
- **The alternative:** wait for the SDK that supports 0.87 and ship the app's
  OTA client then. The OTA *server* is built either way, so nothing else waits.

**Decided: take Momentum's combination and pin back**, then re-check Reanimated
4 and worklets against it. In progress — nothing else in the roadmap depends on
it; the update server, the publish script and the release console at
`/platform/releases` are already built and working.

## 2. A Firebase project — **blocks push notifications**

One project for the product, one app inside it, all tenants — device tokens
live in each shop's own database, the project is ours.

What I need from it:

- [ ] **Service account JSON** (Project settings → Service accounts → Generate
      new private key) → goes in the API as `FIREBASE_SERVICE_ACCOUNT_JSON`.
- [ ] **`google-services.json`** (Android app registered as the app's package
      id) → `apps/mobile/android/app/`.
- [ ] **`GoogleService-Info.plist`** (iOS app registered as the bundle id) →
      `apps/mobile/ios/`.
- [ ] **APNs key** (`.p8`) from the Apple developer account, uploaded to
      Firebase under Cloud Messaging → iOS app configuration.

Until these exist, notifications are built and shown **inside the app** — the
row is the source of truth either way. Firebase is only the transport that
wakes the phone, so nothing about the feature waits on it except the phone
buzzing while the app is closed.

## 3. S3 (or any S3-compatible bucket) — **blocks OTA bundles at any size**

`StorageService` currently logs *"S3 is not configured — every file will be
stored in the database"*. That is fine for order photos and wrong for JS
bundles.

- [ ] Bucket name, region, access key, secret → `S3_BUCKET`, `S3_REGION`,
      `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` in the API's environment.

Cloudflare R2 or Backblaze B2 both work and are cheaper than S3 for this;
either needs `S3_ENDPOINT` set as well.

## 4. A staging environment — **blocks a safe first release of anything**

Phase 0 left this open because it is hosting rather than code. The API now
reports which deployment it is (`APP_ENV`, on `GET /api/health`), so all that
is missing is somewhere to run it.

- [ ] A staging API + database, and a staging web deployment.
- [ ] Decide where production will live (the same place, presumably).

## 5. An error sink — **optional, improves Phase 1**

Errors currently go to the process log with a reference. A Sentry (or similar)
account would put them somewhere searchable.

- [ ] An account and a DSN, if you want one.

## 6. WhatsApp Business API — **long lead time, start early**

Not in the roadmap's numbered phases, but the highest-value gap I flagged: push
reaches staff who install the app, clients live on WhatsApp. Approval through a
BSP takes weeks, so the application is worth starting well before the code.

- [ ] Pick a BSP (Gupshup, AiSensy, Interakt, Meta direct) and start the
      application, with the firm's GST details and a verified number.

---

## Decisions — answered 8 September 2026

Kept here rather than deleted: these are the assumptions the phases ahead are
being built on, and if one of them turns out wrong it is cheaper to find it
written down.

- **How the floor gets paid** — *a mix, and fully configurable*: nobody knows
  yet how a given client pays. So Phase 5 builds monthly salary, daily wage and
  piece rate as configurable pay structures per employee rather than choosing
  one shape.
- **GST invoices** — *raised from this system, on demand*: an invoice is
  generated and downloadable whenever somebody asks for one. The CA is served
  by an Excel export rather than by raising invoices themselves.
- **Modules sold separately** — *yes*, and the entitlement layer for it shipped
  on 8 September: plans, per-tenant extras, and two gates on every route.
- **A Tally / accounting export** — *yes, as an option*. Phase 4's ledger has to
  record what such an export needs: account head, party, tax split and voucher
  kind, not only an amount and a date.
- **A declined quote moves its enquiry** — *yes*. Shipped 8 September: which
  stage it moves to is configured on the lead pipeline, because one shop calls
  it Lost and another keeps working it.
