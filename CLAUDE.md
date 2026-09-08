# Decor Bucket

## Navigation is documented, always

`packages/shared/src/navigation.ts` is the one source of truth for where every
screen lives. The web sidebar, the app menu and `docs/NAVIGATION.md` all read
it.

**Whenever a screen is added, removed or renamed — on either client — do all
three in the same change:**

1. Add or update it in `NAV_GROUPS` (an `items` entry when it belongs in the
   menu, a `children` entry when it is reached from another screen).
2. Run `npm --workspace @decor/shared run docs:nav` to rewrite
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
