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
need a JDK 17+ on the PATH.

## What is in place

**Masters** — material categories and materials (sheet size, thickness, density,
kerf, grain, GST, reorder level), machines with per-category cut rates, tools,
stock locations, customers, vendors, users with roles.

**Inventory** — receive stock as individually-labelled pieces, issue to a job,
transfer, adjust, scrap. Every movement is an append-only ledger row.

**Nesting** — MaxRects nesting with kerf and grain handling. Reports sheets
needed, utilisation, the offcuts you can recover, and what the rest costs.
Sheets are drawn to scale in the browser.

**Production** — jobs on a machine queue, routing steps, start/pause/complete
from the shop floor, machine run log behind every state change, QC with
rejection reasons.

**Waste** — offcut recovery, trim, kerf, rejections and damage, each with a cost
impact and a disposition. Analytics by type, material and disposition, plus the
value of offcut stock sitting on a rack.

**Reports** — dashboard, machine utilisation and downtime, material yield,
planned vs. actual job time.

## Design notes worth knowing

- **Offcut threshold** (`apps/api/src/common/utils/geometry.ts`): a drop only
  becomes a `StockUnit` if it can still hold a real part. Below that it is
  booked as waste. Calling every scrap "inventory" inflates stock on paper.
- **Area always balances**: for any sheet, parts + offcuts + waste equals the
  sheet area. The nester's free rectangles overlap by design, so a disjoint set
  is selected before any area is summed.
- **Document numbers** come from an atomic counter (`DocumentSequence`), not
  "max existing + 1", so two people receiving stock at once cannot collide.
- **Money and quantities are `Decimal`**, never `Float`.

## Not built yet

Purchase orders and goods receipts have schema and no UI. Dispatch, invoicing
and payments are modelled but not wired up. There is no G-code generation and no
direct machine connectivity — ArtCAM stays the CAM tool, and this system plans,
costs and records around it.
