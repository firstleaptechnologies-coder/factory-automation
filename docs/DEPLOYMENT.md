# Deployment

Where FAS runs, and how a change gets there. Written for the first real
deployment — Decor Bucket — and meant to be followed rather than read.

## The shape

| Piece | Where | Why there |
| --- | --- | --- |
| API + scheduled work | One EC2 instance, `ap-southeast-1` (Singapore) | It is a long-lived process. |
| Postgres | Neon, `aws-ap-southeast-1` | Managed backups and point-in-time restore, in the same region as the API. |
| Files (order photos, OTA bundles) | S3, `ap-southeast-1` | The API already speaks S3; without it every file goes into a Postgres row. |
| Web app | Vercel | Static and server-rendered Next; it only needs to reach the API. |
| The phone app | TestFlight / an APK | Its server is chosen by the channel baked into the binary. |

### Why the API is not on Vercel

`apps/api` is a process, not a set of functions. `ReportsJob` runs every minute
on a lease, the nightly jobs hold leases of their own so two instances cannot
both run them, and `JobRunnerService` assumes something is alive between ticks.
Rewriting that against per-invocation functions would mean throwing away
`apps/api/src/common/jobs` and the Dockerfile that already exists. The web app
is a different question — it fits Vercel exactly, and goes there.

### Everything in one region

An API in Mumbai talking to a database in Singapore pays ~50 ms per query, and
a single screen makes several. The API and the database are therefore in the
same region, and the one hop from an Indian factory to Singapore is paid once
per request instead of once per query. Neon has no Indian region, which is what
settles it.

## The names

`firstleaptechnologies.in` is registered through BigRock, and its DNS is served
by BigRock's nameservers — not by Vercel, and not by Route 53. Every record
below is added in BigRock's control panel.

| Name | Record | Points at | What it is |
| --- | --- | --- | --- |
| `firstleaptechnologies.in` | A | `216.198.79.1` | The company site, already on Vercel. **Leave it alone.** |
| `api.firstleaptechnologies.in` | A | the EC2 elastic IP | The API. |
| `app.firstleaptechnologies.in` | CNAME | whatever Vercel asks for | The web app. |

The API needs a name of its own because it needs a certificate of its own: the
phone app will not talk to plain HTTP — iOS blocks it outright and Android has
since 9 — so there is no deployment without one.

## Before any of this can start

- [x] **An AWS account.** Needs an EC2 key pair created in `ap-southeast-1`;
      a key pair belongs to one region.
- [x] **A domain** — see above.
- [x] **A Neon project** in `aws-ap-southeast-1` — see below.

### About the free tier

AWS changed it in mid-2025. Accounts opened before then got 750 hours of
`t2.micro`/`t3.micro` a month for twelve months. This account was opened after,
so it gets credits for six months instead, and then pays. A `t3.micro` is around
$8/mo on demand in Singapore once the credits are gone — the same money as a
managed container host that would need none of the setup below. Worth a note in
the calendar for month five rather than a surprise in month seven.

## 1. The database — **done**

Neon project **FAS** (`lucky-paper-80860691`), branch `production`, region
**AWS Asia Pacific 1 (Singapore)**, Postgres 18. It sits in the
`Firstleap Technologies` organisation on the free plan, which caps the branch at
0.5 GiB — see the S3 note below, which that limit turns from optional into
required.

The schema is already applied: all 37 migrations, run from a developer machine
before the instance existed, because a 1 GB box is a bad place to find out a
migration does not apply.

Two connection strings, both in `deploy/api.env`:

- the **pooled** one (its host contains `-pooler`) → `DATABASE_URL`
- the **direct** one → `DIRECT_URL`

They are not interchangeable. A pooler in transaction mode cannot hold the
session a migration wants, so migrations go through `DIRECT_URL` and everything
else through the pooler.

### What Neon's own setup steps do and do not apply here

Signing up offers a seven-step `neon config init` / `neon.ts` / `neon deploy`
flow. The CLI is useful and is what produced the connection strings above.
`neon deploy` is not used, and should not be: this database's shape is owned by
Prisma migrations, which reach the platform database *and every dedicated
tenant* through `npm run db:migrate:tenants`. A second, declarative source of
truth for the same database is how one of them silently undoes the other — and
`defineConfig({})` is an empty desired state, which is not something to point
at a shop's ledger to find out what it means.

## 2. The instance and the bucket — one script

```bash
AWS_PROFILE=fas deploy/provision-aws.sh
```

It is idempotent: run it twice and the second run reports what already exists
rather than making a second of everything. In order it creates

- an **S3 bucket**, private, encrypted and versioned, plus an **IAM user that
  can reach only that bucket** — the deploy credentials are an administrator's,
  and the thing running in a container all year should not be;
- a **key pair** imported from `~/.ssh/fas-prod.pub`, so the private half never
  travels to AWS at all;
- a **security group** — 80 and 443 from anywhere, 22 from this machine's
  address and nothing else;
- a **t3.micro** running `deploy/cloud-init.sh` as user-data, on a 30 GiB
  encrypted root volume;
- an **elastic IP**, attached. Without one a stopped instance comes back on a
  different address and the DNS record points at whoever gets it next.

`deploy/cloud-init.sh` is what the box does to itself on first boot: Docker and
the compose plugin, a 4 GiB swapfile, `/srv/fas`, and a weekly image prune. It
is a file rather than a list of commands to paste because this box will be
rebuilt one day, and a hand-built machine cannot be rebuilt the same way twice.
It leaves `/var/lib/fas-bootstrap-done` behind, so a deploy can tell "still
booting" from "booted and broken".

### Two follow-ups the script prints rather than does

**The A record**, at BigRock, using the address it printed:

```
api   A   <the elastic IP>
```

**The API's S3 credentials**, which are a secret and belong in `deploy/api.env`
rather than in a script's output:

```bash
aws iam create-access-key --user-name fas-prod-s3
```

### When your address changes

Home broadband hands out a new one every so often, and a security group pinned
to yesterday's is a production box nobody can log into.

```bash
AWS_PROFILE=fas deploy/allow-my-ip.sh
```

## 3. The environment

Two files on the box, in `/srv/fas/deploy/`, and nowhere else. Neither is in
the repository and `.gitignore` keeps it that way — `deploy/ship.sh` does not
copy them either, so they are put there once, by hand.

Both are already drafted on the development machine with the database, the
domain and freshly generated secrets filled in. Send them across and lock them
down:

```bash
scp deploy/api.env deploy/.env ec2-user@api.firstleaptechnologies.in:/srv/fas/deploy/
ssh ec2-user@api.firstleaptechnologies.in 'chmod 600 /srv/fas/deploy/api.env'
```

What is in them, and why:

`deploy/.env` — the one name compose itself interpolates:

```
API_DOMAIN=api.firstleaptechnologies.in
```

`deploy/api.env` — everything the API reads. `apps/api/.env.example` is the
full list with its reasons; the ones that matter here:

```
APP_ENV=production
DATABASE_URL=<Neon pooled>
DIRECT_URL=<Neon direct>
JWT_SECRET=<32+ random bytes>
ENCRYPTION_KEYS=k1:<base64 32-byte key>
CORS_ORIGINS=https://app.firstleaptechnologies.in
S3_BUCKET=... S3_REGION=ap-southeast-1 S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=...
EXPO_OTA_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
```

Regenerate either secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Three of these are worth stopping on:

- **`ENCRYPTION_KEYS`** is the only variable the API refuses to start without
  in production. Lose it and every dedicated tenant's connection string becomes
  unreadable.
- **`EXPO_OTA_PRIVATE_KEY`** must be the same key the app binary was built
  against. An API without it serves unsigned updates, which every app built
  with `apps/mobile/certs/certificate.pem` refuses — silently, from the shop's
  point of view.
- **`CORS_ORIGINS`** is the only thing deciding who may call this API from a
  browser. It is not a list to leave wide.

`S3_*` is the fourth, and on this plan it is not optional. Without a bucket the
API stores every order photo and every OTA bundle in a Postgres row, and the
free branch stops at 0.5 GiB. Phone photos reach that in an afternoon.

## 4. The first deploy

From this machine:

```bash
deploy/ship.sh ec2-user@api.firstleaptechnologies.in
```

That copies the working tree, builds the image on the box, migrates the
platform database and every dedicated tenant, then starts the API and Caddy.
Caddy asks Let's Encrypt for a certificate on its first start, which needs the
A record to already resolve here.

The first build takes a long while on a `t3.micro` — it is compiling
TypeScript on two shared vCPUs against a swapfile. Later builds reuse layers
and are quick.

Check it:

```bash
curl https://api.firstleaptechnologies.in/api/health
```

It reports `APP_ENV`, so nobody has to guess whether they are looking at
staging or at a shop's live data.

## 5. Seeding the first workspace

The platform database starts empty. Create the tenant, its owner and its
modules through the platform screens — the API's own bootstrap — rather than
by hand in SQL: a tenant without a `TenantModule` row is a workspace whose
every screen is gated off, and that is very confusing to debug from the inside.

## 6. The web app

A new Vercel project with root directory `apps/web`, and the domain
`app.firstleaptechnologies.in` added to it — Vercel will name the CNAME target
to put in BigRock. One environment variable:

```
NEXT_PUBLIC_API_URL=https://api.firstleaptechnologies.in/api
```

`CORS_ORIGINS` on the box must already list that origin, or the browser refuses
every call the page makes. Vercel's preview deployments get their own hostnames
and are therefore *not* covered by it; that is deliberate, and a preview that
needs to reach the API needs its origin added on purpose.

## 7. The phone app

The app picks its server from the channel baked into the binary — see
`apps/mobile/src/api/environments.ts`. For a production build:

1. `production.apiOrigin` is already filled in as
   `https://api.firstleaptechnologies.in`.
2. Set the channel to `production` in **both** native files:
   `ios/Expo.plist` (`expo-channel-name`) and
   `android/app/src/main/res/values/strings.xml`.
3. Set the update URL in both to
   `https://api.firstleaptechnologies.in/api/updates/manifest` — `EXUpdatesURL`
   in the plist, `EXPO_UPDATE_URL` in `AndroidManifest.xml`.
4. `npm run verify`. `environments.spec.ts` fails if the two platforms disagree,
   if the channel has no server, or if the update URL is not the same server the
   app sends its work to.

All four are one commit, and that commit is a store release: the channel, the
update URL and the certificate are in the binary, and an update cannot change
any of them.

## Deploying again

```bash
deploy/ship.sh ec2-user@api.firstleaptechnologies.in
```

Same script, same order: copy, migrate every tenant, restart. It exits non-zero
if a dedicated tenant could not be reached, and the API is not restarted when
that happens — a green deploy that skipped a tenant is the dangerous outcome,
not an error.

## What this does not have yet

Said plainly, so nobody discovers it on the day it matters:

- **No staging.** One box, and it is the shop's. `APP_ENV` exists to tell them
  apart; there is nothing to tell apart yet.
- **Nothing watches the box.** If it stops, the first to know is whoever tries
  to punch an order. A CloudWatch alarm on the instance's status check is the
  cheapest fix.
- **No error sink.** Errors go to the container log with a reference the caller
  was shown. Finding one means `docker compose logs`.
- **Backups are Neon's.** Which is the right place for them, but nobody has
  restored one yet, and a backup nobody has restored is a hope.
- **One instance.** A deploy is a few seconds of downtime, and a reboot is a
  few minutes of it.
