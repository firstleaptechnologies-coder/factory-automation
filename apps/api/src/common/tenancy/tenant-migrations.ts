/**
 * Working out which databases a schema change has to reach.
 *
 * `prisma migrate deploy` migrates one database: whichever `DATABASE_URL`
 * happens to point at. That is the whole story only while every tenant is
 * SHARED, because a shared tenant's rows live in the platform database and are
 * kept apart by `tenantId` alone.
 *
 * A DEDICATED tenant has its own database, and nothing about deploying a
 * migration tells you it exists. Left as it was, a schema change lands on the
 * platform database, the deploy goes green, and the dedicated tenant's app
 * starts throwing on a column that was never added to their database — which
 * is discovered by them, in front of a customer, rather than by us.
 *
 * So the plan is computed rather than assumed, and a tenant that *cannot* be
 * migrated is reported as a failure instead of being quietly passed over. The
 * dangerous outcome here is not an error; it is a silent success.
 */

export type TenantIsolation = 'SHARED' | 'DEDICATED';

export interface TenantRow {
  slug: string;
  isolation: TenantIsolation;
  /** Encrypted at rest. Only ever set for DEDICATED. */
  databaseUrl: string | null;
}

export interface MigrationTarget {
  /** Every tenant living in this database — normally one. */
  slugs: string[];
  /** Decrypted connection string. Never log this; use `redactUrl`. */
  url: string;
}

export interface BlockedTenant {
  slug: string;
  reason: string;
}

export interface MigrationPlan {
  /** Covered by migrating `DATABASE_URL` itself, because they live in it. */
  shared: string[];
  /** Databases that each need their own `migrate deploy`. */
  targets: MigrationTarget[];
  /** Tenants that cannot be reached, and why. Never silently dropped. */
  blocked: BlockedTenant[];
}

/**
 * Decide what has to be migrated, given the tenant list and a way to decrypt.
 *
 * `decrypt` is passed in rather than imported so this stays pure and the script
 * that runs it can supply the real `EncryptionService`.
 */
export function planMigrations(
  tenants: TenantRow[],
  decrypt: (envelope: string) => string,
): MigrationPlan {
  const shared: string[] = [];
  const blocked: BlockedTenant[] = [];
  // Keyed by connection string: two tenants pointed at one database should be
  // migrated once, not twice, and the second run would be a no-op that still
  // costs a connection and a lock.
  const byUrl = new Map<string, string[]>();

  for (const tenant of tenants) {
    if (tenant.isolation === 'SHARED') {
      // A shared tenant with a database URL is a contradiction: the field is
      // only meaningful for DEDICATED, and honouring it would migrate a
      // database the application will never read from.
      if (tenant.databaseUrl) {
        blocked.push({
          slug: tenant.slug,
          reason: 'shared, but carries a database URL — one of the two is wrong',
        });
        continue;
      }
      shared.push(tenant.slug);
      continue;
    }

    if (!tenant.databaseUrl) {
      blocked.push({
        slug: tenant.slug,
        reason: 'dedicated, but has no database URL',
      });
      continue;
    }

    let url: string;
    try {
      url = decrypt(tenant.databaseUrl);
    } catch (error) {
      blocked.push({
        slug: tenant.slug,
        reason: `database URL could not be decrypted — ${messageOf(error)}`,
      });
      continue;
    }

    if (!url.trim()) {
      blocked.push({ slug: tenant.slug, reason: 'database URL decrypts to nothing' });
      continue;
    }

    const existing = byUrl.get(url);
    if (existing) existing.push(tenant.slug);
    else byUrl.set(url, [tenant.slug]);
  }

  return {
    shared,
    targets: [...byUrl.entries()].map(([url, slugs]) => ({ url, slugs })),
    blocked,
  };
}

export interface MigrationOutcome {
  slugs: string[];
  url: string;
  ok: boolean;
  /** What happened, in one line. On failure, why. */
  detail: string;
}

/**
 * A connection string with its password removed.
 *
 * These end up in deploy logs, and a deploy log is not a secret store. The
 * host and database name are what somebody reading the log actually needs.
 */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    // Not a parseable URL. Say nothing rather than risk printing a credential.
    return '(unparseable connection string)';
  }
}

export interface MigrationReport {
  lines: string[];
  /** Non-zero when anything was blocked or failed, for the process exit code. */
  exitCode: number;
}

/** The run, written out for whoever is reading the deploy. */
export function report(plan: MigrationPlan, outcomes: MigrationOutcome[]): MigrationReport {
  const lines: string[] = [];

  lines.push(
    `${plan.shared.length} shared tenant${plural(plan.shared.length)} covered by the platform database` +
      (plan.shared.length ? ` (${plan.shared.join(', ')})` : ''),
  );

  for (const outcome of outcomes) {
    const who = outcome.slugs.join(', ');
    const mark = outcome.ok ? 'ok  ' : 'FAIL';
    lines.push(`${mark} ${who} — ${redactUrl(outcome.url)} — ${outcome.detail}`);
  }

  for (const tenant of plan.blocked) {
    lines.push(`FAIL ${tenant.slug} — ${tenant.reason}`);
  }

  const failures = outcomes.filter((outcome) => !outcome.ok).length + plan.blocked.length;
  lines.push(
    failures === 0
      ? `All ${outcomes.length + plan.shared.length} tenants are on the current schema.`
      : `${failures} tenant database${plural(failures)} did not migrate. The schema is now uneven.`,
  );

  return { lines, exitCode: failures === 0 ? 0 : 1 };
}

const plural = (count: number) => (count === 1 ? '' : 's');

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
