/**
 * Apply pending migrations to every database the product owns.
 *
 *   npm run db:migrate:tenants            # migrate everything
 *   npm run db:migrate:tenants -- --dry   # say what would be migrated
 *
 * `prisma migrate deploy` reaches exactly one database. That is enough while
 * every tenant is SHARED, because their rows sit in the platform database. A
 * DEDICATED tenant has a database of its own, and deploying a migration tells
 * you nothing about it — the deploy goes green and their schema stays behind.
 *
 * So: migrate the platform database first, then every dedicated tenant's, and
 * exit non-zero if any of them could not be reached. Run it as a pre-deploy
 * step, before the new code starts serving.
 *
 * Needs: DATABASE_URL, and ENCRYPTION_KEYS to read the stored connection
 * strings. Add DIRECT_URL when the runtime URL goes through a pooler —
 * migrations must not.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';

// Explicitly, and before anything reads `process.env`. Importing the Prisma
// client happens to load this file too, but that is a side effect of a library
// import — not something to leave a migration's credentials depending on.
loadEnv({ path: path.resolve(__dirname, '..', '.env') });

// eslint-disable-next-line import/first
import { PrismaClient } from '@prisma/client';
import { EncryptionService } from '../src/common/crypto/encryption.service';
import {
  MigrationOutcome,
  TenantRow,
  planMigrations,
  redactUrl,
  report,
} from '../src/common/tenancy/tenant-migrations';

const API_DIR = path.resolve(__dirname, '..');
const dryRun = process.argv.includes('--dry');

/**
 * Prisma reads the connection string from the environment, so each database is
 * migrated by running the real migrate engine with `DATABASE_URL` swapped —
 * rather than by reimplementing what `migrate deploy` does, which is exactly
 * the kind of reimplementation that drifts.
 *
 * `DIRECT_URL` is overridden alongside it: when it is set, that is the one
 * Prisma actually connects with for migrations, and leaving it pointing at the
 * platform database would migrate that database again under a tenant's name.
 */
function migrate(url: string): { ok: boolean; detail: string } {
  if (dryRun) return { ok: true, detail: 'would migrate (dry run)' };

  const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: API_DIR,
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
    encoding: 'utf8',
  });

  if (result.status === 0) {
    // Counted from the engine's own "Applying migration `…`" lines rather than
    // guessed. Reporting "already up to date" for a database that just took
    // thirty migrations is the one wrong answer a deploy log must not give.
    const applied = (result.stdout.match(/^Applying migration /gm) ?? []).length;
    return {
      ok: true,
      detail: applied === 0 ? 'no pending migrations' : `applied ${applied} migration${applied === 1 ? '' : 's'}`,
    };
  }

  // Prisma puts the useful line in stderr and the noise in stdout.
  const detail = (result.stderr || result.stdout || 'migrate deploy failed')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-2)
    .join(' — ');

  return { ok: false, detail };
}

/**
 * Confirm the database is already there, without creating it.
 *
 * `prisma migrate deploy` creates a database that does not exist and then
 * reports success — which for a *tenant* is the worst thing it could do: a
 * stale or mistyped connection string quietly gets a brand new empty database,
 * fully migrated, while the shop's actual data sits untouched somewhere else,
 * and the deploy log says ok. Provisioning a tenant database is a deliberate
 * act that belongs in the platform module, never a side effect of migrating.
 *
 * Connecting a client does not create anything, so this is the check.
 */
async function unreachable(url: string): Promise<string | null> {
  const probe = new PrismaClient({ datasources: { db: { url } } });
  try {
    await probe.$queryRaw`select 1`;
    return null;
  } catch (error) {
    return causeOf(error);
  } finally {
    await probe.$disconnect().catch(() => undefined);
  }
}

/**
 * The line of a Prisma error that says what actually went wrong.
 *
 * Prisma opens with `Invalid \`prisma.$queryRaw()\` invocation:` and puts the
 * cause — the database not existing, the host refusing — several lines below.
 * Printing the first line tells whoever is reading the deploy nothing they can
 * act on.
 */
function causeOf(error: unknown): string {
  const code = (error as { code?: string })?.code;
  const text = error instanceof Error ? error.message : String(error);
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);

  const cause =
    lines.find((line) => /does not exist|can't reach|fatal:|econnrefused|authentication/i.test(line)) ??
    lines.at(-1) ??
    'unknown error';

  return code ? `${cause} (${code})` : cause;
}

async function main(): Promise<void> {
  const platformUrl = process.env.DATABASE_URL;
  if (!platformUrl) throw new Error('DATABASE_URL is not set');

  // The platform database goes first, and a failure there stops everything:
  // the tenant list lives in it, so there is nothing to read afterwards and
  // no honest way to report on the rest.
  console.log(`Platform database — ${redactUrl(platformUrl)}`);
  const platformMissing = await unreachable(platformUrl);
  if (platformMissing) {
    console.log(`FAIL platform — database is not reachable — ${platformMissing}`);
    process.exit(1);
  }
  const platform = migrate(platformUrl);
  console.log(`${platform.ok ? 'ok  ' : 'FAIL'} platform — ${platform.detail}`);
  if (!platform.ok) process.exit(1);

  const prisma = new PrismaClient();
  let tenants: TenantRow[];
  try {
    tenants = (await prisma.tenant.findMany({
      select: { slug: true, isolation: true, databaseUrl: true },
      orderBy: { slug: 'asc' },
    })) as TenantRow[];
  } finally {
    await prisma.$disconnect();
  }

  const encryption = new EncryptionService({
    get: (key: string) => process.env[key],
  } as never);
  encryption.onModuleInit();

  const plan = planMigrations(tenants, (envelope) => encryption.decryptToString(envelope));

  const outcomes: MigrationOutcome[] = [];
  for (const target of plan.targets) {
    // Sequential on purpose. These hold migration locks, and a handful of
    // parallel connections to a database that is also serving traffic buys
    // nothing worth the risk.
    const missing = await unreachable(target.url);
    if (missing) {
      outcomes.push({
        slugs: target.slugs,
        url: target.url,
        ok: false,
        detail: `database is not reachable — ${missing}`,
      });
      continue;
    }

    const result = migrate(target.url);
    outcomes.push({ slugs: target.slugs, url: target.url, ...result });
  }

  const { lines, exitCode } = report(plan, outcomes);
  console.log('');
  for (const line of lines) console.log(line);

  process.exit(exitCode);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
