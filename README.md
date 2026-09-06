# Decor Bucket

Manufacturing ERP for a CNC-based architectural decor unit: four CNC machines
cutting wood, stone, acrylic, metal and WPC.

The system is built around one idea — **every physical piece of material is
tracked individually**. A sheet has a barcode, an offcut cut from that sheet has
its own barcode and points back at its parent, and a job records which pieces it
consumed. That chain is what makes real waste management possible instead of a
bulk quantity that drifts from reality within a week.

## Layout

```
apps/api       NestJS + Prisma + PostgreSQL — the whole domain
apps/web       Next.js — office: orders, planning, nesting, inventory, reports
apps/mobile    React Native (bare CLI, no Expo) — shop floor: run jobs, log offcuts
packages/shared  Wire types, API client and formatters used by both clients
```

`apps/api`, `apps/web` and `packages/shared` are npm workspaces. `apps/mobile`
deliberately is **not** — bare React Native needs its own `node_modules` for
CocoaPods and Gradle autolinking to work. It joins the monorepo through Metro
(`watchFolders` + an `@decor/shared` alias), so shared code is still shared.

## Running it

Prerequisites: Node 22+, PostgreSQL 17.

```bash
npm install
cp apps/api/.env.example apps/api/.env    # then set DATABASE_URL
createdb decor_bucket
npm run db:migrate
npm run db:seed
```

The seed loads the five material families, eight real materials, the four CNC
machines, stock locations, downtime/rejection reason codes and starter logins
(`ADMIN` / `admin123` — change these before the system leaves the office).

```bash
npm run dev:api      # http://localhost:3001/api
npm run dev:web      # http://localhost:3000
npm run dev:mobile   # Metro; then npm run ios  or  npm run android
```

For iOS you also need `cd apps/mobile/ios && pod install` once. Android builds
need a JDK 17+ on the PATH (Android Studio's bundled JBR works:
`export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"`).

**Metro must own port 8081.** React Native 0.87 ships React-Core as a prebuilt
binary with the packager port compiled in, so `RCT_METRO_PORT` and
`--port` cannot move it — the app will silently load whatever project's bundle
is answering on 8081, and fail with `'PlatformConstants' could not be found` and
an empty native-module list. If you hit that, check who owns the port:

```bash
lsof -a -p "$(lsof -nP -iTCP:8081 -sTCP:LISTEN -t)" -d cwd -Fn
```

## What is in place

**Order punching** — client, location, sizes, material, thickness, photos. The
client can be found or created inline; a phone match reuses the existing client
so punching the same customer twice does not create a duplicate. Sizes accept
what people actually type — `8`, `8' 6"`, `2440mm`, `3/4in` — and the resolved
millimetres are shown before saving.

**Leads** — a pipeline board with drag-and-drop, and one-click conversion into
an order. Leads carry admin-defined fields, so the shop captures what it needs
(site area, architect, budget band) without a schema change. Converting keeps
the lead and links it to the order, so the pipeline can report what actually
converted.

**Configurable statuses** — statuses, their hierarchy, and the arrows between
them are drawn on a canvas by the admin. The graph *is* the rule: a status move
is allowed only if an arrow exists, and redrawing it immediately changes what
orders and leads can do. Orders and leads each get their own pipeline, edited
with the same builder.

**Boards** — orders and leads both use a drag-and-drop board. A card dropped on
a column that the flow does not allow is refused, snaps back, and says why.

**Admin configuration** — materials and their thickness options, size presets,
lead fields, lead sources. Everything is entered in whatever unit suits and
stored in millimetres.

## Units

Millimetres are the only unit stored. Feet is the default the UI shows, and any
screen can switch between mm, cm, m, in and ft without another round trip —
the API returns both the stored millimetres and the converted display values.

Thickness is the exception to the display unit: it always renders in
millimetres, because an 18 mm board shown in feet reads "0.059 ft".

## Design notes worth knowing

- **One encryption function** (`apps/api/src/common/crypto/encryption.service.ts`):
  AES-256-GCM, authenticated, fresh random IV per call, versioned envelope with
  rotatable keys. Everything needing protection goes through it. Files stored in
  Postgres are always encrypted.
- **Images are optimised twice**: in the browser before upload, so a 12 MP site
  photo never crosses shop wifi at full size, and again on the server, because a
  client can be bypassed. EXIF is stripped after orientation is baked in — site
  photos carry GPS. If a file still exceeds its budget, quality and then
  dimensions are stepped down rather than the upload being refused.
- **Storage spans S3 and Postgres** behind one interface. Ordinary optimised
  photos stay in the database, where they are inside the same backup and
  transaction as the order; larger files go to S3.
- **Orders snapshot their sizes.** A size preset edited next month must not
  rewrite what was ordered today.
- **Document numbers** come from an atomic counter (`DocumentSequence`), not
  "max existing + 1", so two people punching at once cannot collide.
- **Money and dimensions are `Decimal`**, never `Float`.

## Not built yet

Attaching photos from the phone needs a camera module
(`react-native-image-picker` or similar) plus a `pod install` and rebuild; the
mobile punch screen says so. Custom fields exist for leads only — the same
machinery covers orders and clients but has no UI yet. There is no production
scheduling, dispatch or invoicing, and no G-code generation or machine
connectivity: ArtCAM stays the CAM tool.
