import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * `npm run db:migrate:tenants -- --dry` has to actually be a dry run.
 *
 * It was not. The root script delegates — `npm run migrate:tenants -w @fas/api`
 * — and npm appends whatever follows `--` to the end of *that* command, where
 * the inner npm reads `--dry` as one of its own flags and drops it. The script
 * never saw it, `dryRun` was false, and a command whose whole purpose is to
 * change nothing migrated every database it was pointed at. It said so in its
 * output, which is the only reason it was caught.
 *
 * The fix is the trailing `--` on the delegating script, so the flag is handed
 * to the script rather than to npm. This is that fix, written down: it is one
 * character, invisible in review, and nothing else in the repository would
 * fail if somebody tidied it away.
 */
const root = JSON.parse(
  readFileSync(join(__dirname, '..', '..', '..', '..', '..', 'package.json'), 'utf8'),
) as { scripts: Record<string, string> };

/** Scripts that hand off to one workspace's script, where flags can be meant. */
const DELEGATES = /^npm run [a-z:]+ (?:-w|--workspace) \S+/;

describe('a root script that delegates to a workspace', () => {
  const delegating = Object.entries(root.scripts).filter(([, command]) =>
    DELEGATES.test(command),
  );

  it('there are some, so this test is testing something', () => {
    expect(delegating.length).toBeGreaterThan(0);
  });

  it.each(delegating)('passes its arguments through: %s', (_name, command) => {
    expect(command.trimEnd().endsWith(' --')).toBe(true);
  });

  it('includes the one this was written for', () => {
    expect(root.scripts['db:migrate:tenants']).toBe(
      'npm run migrate:tenants -w @fas/api --',
    );
  });
});
