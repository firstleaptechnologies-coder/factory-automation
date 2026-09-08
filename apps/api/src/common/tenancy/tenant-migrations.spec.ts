import {
  MigrationOutcome,
  TenantRow,
  planMigrations,
  redactUrl,
  report,
} from './tenant-migrations';

const plain = (envelope: string) => envelope.replace(/^enc:/, '');

const tenant = (over: Partial<TenantRow> & { slug: string }): TenantRow => ({
  isolation: 'SHARED',
  databaseUrl: null,
  ...over,
});

describe('planning which databases a migration reaches', () => {
  it('covers shared tenants through the platform database, not separately', () => {
    const plan = planMigrations(
      [tenant({ slug: 'decorbucket' }), tenant({ slug: 'woodcraft' })],
      plain,
    );

    expect(plan.shared).toEqual(['decorbucket', 'woodcraft']);
    expect(plan.targets).toHaveLength(0);
    expect(plan.blocked).toHaveLength(0);
  });

  it('gives every dedicated tenant its own target', () => {
    const plan = planMigrations(
      [
        tenant({ slug: 'decorbucket' }),
        tenant({
          slug: 'bigshop',
          isolation: 'DEDICATED',
          databaseUrl: 'enc:postgres://u:p@host/bigshop',
        }),
      ],
      plain,
    );

    expect(plan.shared).toEqual(['decorbucket']);
    expect(plan.targets).toEqual([
      { url: 'postgres://u:p@host/bigshop', slugs: ['bigshop'] },
    ]);
  });

  it('migrates a shared database once when two tenants point at it', () => {
    const plan = planMigrations(
      [
        tenant({ slug: 'one', isolation: 'DEDICATED', databaseUrl: 'enc:postgres://u:p@host/db' }),
        tenant({ slug: 'two', isolation: 'DEDICATED', databaseUrl: 'enc:postgres://u:p@host/db' }),
      ],
      plain,
    );

    expect(plan.targets).toHaveLength(1);
    expect(plan.targets[0].slugs).toEqual(['one', 'two']);
  });

  // The whole point of the module: an unreachable tenant must not read as
  // success, because a green deploy is what hides the problem.
  it('blocks a dedicated tenant with no database URL rather than skipping it', () => {
    const plan = planMigrations(
      [tenant({ slug: 'halfmade', isolation: 'DEDICATED', databaseUrl: null })],
      plain,
    );

    expect(plan.targets).toHaveLength(0);
    expect(plan.blocked).toEqual([
      { slug: 'halfmade', reason: 'dedicated, but has no database URL' },
    ]);
  });

  it('blocks a tenant whose URL will not decrypt, naming the reason', () => {
    const plan = planMigrations(
      [tenant({ slug: 'rotated', isolation: 'DEDICATED', databaseUrl: 'enc:whatever' })],
      () => {
        throw new Error('no key with that id');
      },
    );

    expect(plan.blocked[0].slug).toBe('rotated');
    expect(plan.blocked[0].reason).toContain('no key with that id');
  });

  it('blocks a tenant whose URL decrypts to nothing', () => {
    const plan = planMigrations(
      [tenant({ slug: 'empty', isolation: 'DEDICATED', databaseUrl: 'enc:   ' })],
      plain,
    );

    expect(plan.blocked[0].reason).toBe('database URL decrypts to nothing');
  });

  // Migrating it would touch a database the application never reads, and
  // leaving it silent would hide a contradiction in the tenant record.
  it('blocks a shared tenant that carries a database URL', () => {
    const plan = planMigrations(
      [tenant({ slug: 'confused', databaseUrl: 'enc:postgres://u:p@host/db' })],
      plain,
    );

    expect(plan.shared).toHaveLength(0);
    expect(plan.targets).toHaveLength(0);
    expect(plan.blocked[0].reason).toContain('one of the two is wrong');
  });
});

describe('redacting a connection string', () => {
  it('removes the password and keeps what a reader needs', () => {
    const redacted = redactUrl('postgres://admin:s3cret@db.blr1.example.com:25060/decor');

    expect(redacted).not.toContain('s3cret');
    expect(redacted).toContain('db.blr1.example.com');
    expect(redacted).toContain('decor');
  });

  it('says nothing at all when the string will not parse', () => {
    expect(redactUrl('not a url with s3cret in it')).toBe('(unparseable connection string)');
  });
});

describe('reporting the run', () => {
  const outcome = (over: Partial<MigrationOutcome>): MigrationOutcome => ({
    slugs: ['bigshop'],
    url: 'postgres://u:p@host/bigshop',
    ok: true,
    detail: 'no pending migrations',
    ...over,
  });

  it('exits zero when every database is on the current schema', () => {
    const plan = planMigrations([tenant({ slug: 'decorbucket' })], plain);

    const { exitCode, lines } = report(plan, []);

    expect(exitCode).toBe(0);
    expect(lines.at(-1)).toContain('are on the current schema');
  });

  it('exits non-zero when a migration failed', () => {
    const plan = planMigrations([], plain);

    const { exitCode, lines } = report(plan, [
      outcome({ ok: false, detail: 'connection refused' }),
    ]);

    expect(exitCode).toBe(1);
    expect(lines.join('\n')).toContain('FAIL bigshop');
    expect(lines.at(-1)).toContain('The schema is now uneven.');
  });

  // A blocked tenant never gets as far as an outcome, so the exit code has to
  // count it too — otherwise the deploy passes with a tenant left behind.
  it('exits non-zero when a tenant was blocked before it could be tried', () => {
    const plan = planMigrations(
      [tenant({ slug: 'halfmade', isolation: 'DEDICATED', databaseUrl: null })],
      plain,
    );

    const { exitCode, lines } = report(plan, []);

    expect(exitCode).toBe(1);
    expect(lines.join('\n')).toContain('FAIL halfmade');
  });

  it('never prints a password', () => {
    const plan = planMigrations([], plain);

    const { lines } = report(plan, [
      outcome({ url: 'postgres://admin:s3cret@host/db', ok: false, detail: 'timed out' }),
    ]);

    expect(lines.join('\n')).not.toContain('s3cret');
  });
});
