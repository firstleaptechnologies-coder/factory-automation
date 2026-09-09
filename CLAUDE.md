# FAS — Factory Automation Software

## Navigation is documented, always

`packages/shared/src/navigation.ts` is the one source of truth for where every
screen lives. The web sidebar, the app menu and `docs/NAVIGATION.md` all read
it.

**Whenever a screen is added, removed or renamed — on either client — do all
three in the same change:**

1. Add or update it in `NAV_GROUPS` (an `items` entry when it belongs in the
   menu, a `children` entry when it is reached from another screen).
2. Run `npm --workspace @fas/shared run docs:nav` to rewrite
   `docs/NAVIGATION.md`.
3. Check the coverage specs still pass — they fail until 1 and 2 are done:
   - `apps/web/src/app/coverage.spec.ts`
   - `apps/mobile/src/navigation/coverage.spec.ts`
   - `packages/shared/src/navigation.spec.ts` (compares the committed doc with
     the tree)

A screen nobody can find is a screen nobody uses, and the two clients have
drifted apart before precisely because each kept its own list.

## Everything is checked before it is pushed

`npm run verify` runs exactly what CI runs — the shared build, the Prisma
client, four typechecks and all four suites (api, web, shared, mobile). CI lives
in `.github/workflows/ci.yml` and gates every branch; the mobile app is a
separate job because it is deliberately outside the npm workspaces.

Two suites exist to catch what nothing else would:

- `apps/api/src/common/tenancy/tenant-coverage.spec.ts` reads `schema.prisma`
  and fails when a model carrying `tenantId` is missing from
  `TENANT_SCOPED_MODELS` — that omission is one business reading another's rows,
  and nothing about writing the model makes it visible.
- `apps/api/src/modules/routes.spec.ts` reads the controllers' decorators, so a
  route that loses its permission — or gains a public one — fails here.

## Scheduled work goes through the runner

Anything on a clock is a `@Cron` handler that calls
`JobRunnerService.run(name, work)` (`apps/api/src/common/jobs/`). That is what
gives it a lease, so one instance runs it, and a `JobRun` row, so anyone can ask
whether it ran last night and what it did. A job that reaches into the scheduler
by itself has neither.

## Three logs, and which one a change belongs in

- **`AuditLog`** — the shop's own business record, in the tenant's database.
  Written underneath every write by the Prisma extension in
  `apps/api/src/common/audit/`; nothing calls it. When a change has a reason
  worth keeping — a reversal, a correction — wrap the write in
  `withAuditNote({ reason })`, which must **await** the callback: a Prisma
  promise is lazy, and handed back unawaited the note attaches to nothing.
- **`ServerLog`** — ours, in the platform database, across tenants: what was
  called, what it cost, what failed and the reference the caller was shown.
  Written by an interceptor. Successful reads are deliberately not recorded.
- **`ClientLog`** — what the app and the browser saw, sent in batches through
  `POST /logs` and queued on the device until it can be sent.

A model that holds a shop's data is audited or is listed in `NOT_AUDITED` with
a reason — `audited-models.spec.ts` fails otherwise.

Money rows are append-only. A receipt is corrected by recording its opposite,
never by editing or deleting it; the same will hold for everything that posts
to the ledger.

## A schema change reaches every tenant, or none

`prisma migrate deploy` migrates one database. That is the whole story only
while every tenant is `SHARED`, because their rows live in the platform
database and are kept apart by `tenantId`. A `DEDICATED` tenant has a database
of its own, and nothing about a successful deploy tells you it was left behind.

So migrations go through `npm run db:migrate:tenants`
(`apps/api/scripts/migrate-tenants.ts`), which migrates the platform database,
then every dedicated tenant's, and exits non-zero if any could not be reached.
Run it *before* the new code starts serving.

Two things it deliberately refuses to do:

- **It never creates a database.** `migrate deploy` will happily create one
  that does not exist and report success — which for a tenant means a stale
  connection string silently gets a fresh empty database while the shop's real
  data sits elsewhere. Every target is probed first; provisioning belongs in
  the platform module.
- **It never passes over a tenant it could not reach.** A dedicated tenant with
  no URL, or one that will not decrypt, is a failure, not a skip. The dangerous
  outcome here is not an error — it is a green deploy.

## Updates are signed, and the key is not in here

The app carries `apps/mobile/certs/certificate.pem` and refuses any update that
does not verify against it. The private half signs on the API side, from
`EXPO_OTA_PRIVATE_KEY`, and lives only in an environment — never in the
repository, never in a commit.

Two consequences worth remembering before touching this:

- **A release published by an API without the key is unsigned**, and every app
  built with the certificate will refuse it. Staging and production each need
  the key, and it must be the same one the binary was built against.
- **The certificate is baked into the binary**, as are the update URL and the
  runtime version. Changing any of them is a store release, not an update.
