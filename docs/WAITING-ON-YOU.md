# Waiting on you

Things only you can do — accounts, credentials and decisions that need a
person. Everything here blocks something specific, and what it blocks is named
so it is obvious what unlocks when you get to it.

*Last updated 9 September 2026.*

---

## 1. ~~React Native 0.87.1 → 0.86.3~~ — **done, 8 September 2026**

Pinned to 0.86.3 and the Expo modules are in, so the app can now take updates
over the air.

**Reanimated and worklets did have to move**, and not for the reason it first
looked like. Both 4.6.0 and 0.12.1 accept React Native 0.86 on their own
(`"0.83 - 0.87"`), so the pin alone did not disturb them — but Expo's
`expo-modules-core@57` accepts worklets `0.7–0.10` and Reanimated 4.6 demands
`0.12.x`. The two cannot both be satisfied. So the app now runs the set Expo
SDK 57 is built against: **Reanimated 4.5.1 and worklets 0.10.1**, both of
which declare `react-native: "0.83 - 0.86"` themselves. Gesture Handler 3.2.1
and Skia 2.11.2 needed no change — their peer ranges are open.

The other thing the pin cost was the iOS floor: Expo SDK 57's modules need
**16.4**, and the app was on 15.1.

Updates are **code-signed**: the app carries a certificate
(`apps/mobile/certs/certificate.pem`, committed, valid to September 2036) and
refuses any update that does not verify against it. The private half signs on
the API side and is deliberately not in this repository.

*Two things remaining, and both are yours:*

- [ ] **The signing key belongs in every environment that serves updates.** It
      is in `apps/api/.env` for development. Copy it into staging and
      production as `EXPO_OTA_PRIVATE_KEY`, and **keep a copy somewhere safe**
      — a password manager, not a laptop. Lose it and no phone already carrying
      the certificate will accept another update: the way back is a store
      release with a new certificate.
- [ ] **The update URL** in `apps/mobile/app.json`, `ios/Expo.plist` and the
      Android manifest points at `http://localhost:3001`, because there is
      nowhere else yet. It is baked into the binary, so it has to be right
      *before* the first real build — see item 4.

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

## ~~Calls I made for you~~ — all three overruled, 9 September 2026

You said fix all three, and all three are fixed:

- **`ExpenseEditHistory` exists**, as momentum has it: one row per create, edit
  and reversal, with a JSON list of `{ field, from, to }` and the name of who
  did it copied onto the row so the log still reads after their account is
  gone. It earns its place rather than duplicating the audit trail: the edit
  form now asks **why** the change is being made, and that sentence sits beside
  the fields it explains on the expense's own screen. The audit trail is still
  there, underneath, on the same page.
- **Expenses are append-only, like the rest of the money.** There is no delete
  route at all. `POST /expenses/:id/reverse` records the opposite row — the
  negative amount, the negative tax, the reason — and both stand. Reversing one
  twice is refused, and so is reversing a correction.
- **A settled payout can be taken back**, the mirror of taking a receipt back:
  `POST /disbursements/:id/reverse`. A payout that was only ever planned is
  still cancelled instead, because an intention is not a movement of money.

**Still true and worth knowing:** **Expenses and People are modules**, and both
are off by default. Every workspace that should have them needs them switched
on from the platform console — I turned both on for `decorbucket` in
development. A workspace without People has no employees, no register, no
payroll and no letters; roles are deliberately outside every module, because a
workspace that could not manage them is one nobody could take a permission
away in.

## One thing Phase 5 turned up that is worth your eye

Building the roles screen made it obvious that **a good deal of the API was
still gated on the old coarse role** (SALES / MANAGER / PRODUCTION) rather than
on permissions, and that several reads were gated on nothing at all — a role
with every box unticked could still read every order in the shop. Nobody had
noticed, because the only roles were four seeded ones that could all see
orders.

That is fixed: every write hangs off a permission, every read of a shop's own
rows does too, and `routes.spec.ts` now fails on the next route that does not.
**If you had given anybody a custom role before today, check it again** — it
now governs things it previously did not.

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
