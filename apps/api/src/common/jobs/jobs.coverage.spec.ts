import { execSync } from 'node:child_process';
import { SCHEDULED_JOBS } from '@fas/shared';

/**
 * The rail under the job board.
 *
 * `SCHEDULED_JOBS` is what the dashboard reports on. If a job is added with an
 * `@Cron` handler and nobody adds it here, it runs — or stops running — with
 * nothing watching it, which is the exact blindness the board was built to
 * end. And a name left here after its handler goes reads as a job that has
 * never run, for ever.
 *
 * So the decorators are read from the source and compared both ways.
 */
describe('every scheduled job is on the board', () => {
  /** The `name:` given to each @Cron decorator across the API. */
  function cronNamesInSource(): string[] {
    // The name is a constant, so take the constant's *value* from the file that
    // exports it rather than the identifier at the call site.
    const decorators = execSync(
      `grep -rhoE "@Cron\\([^)]*name: [A-Z_]+" ${__dirname}/../../ --include=*.ts | grep -oE "name: [A-Z_]+" | sed 's/name: //' | sort -u`,
      { encoding: 'utf8' },
    )
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const values: string[] = [];
    for (const constant of decorators) {
      const declaration = execSync(
        `grep -rhoE "export const ${constant} = '[^']+'" ${__dirname}/../../ --include=*.ts | head -1`,
        { encoding: 'utf8' },
      ).trim();
      const match = declaration.match(/'([^']+)'/);
      if (match) values.push(match[1]);
    }
    return [...new Set(values)].sort();
  }

  const inSource = cronNamesInSource();
  const onBoard = SCHEDULED_JOBS.map((job) => job.name).sort();

  it('finds the cron handlers at all', () => {
    // A grep that silently matches nothing would make both directions below
    // pass while checking nothing.
    expect(inSource.length).toBeGreaterThan(0);
  });

  it('has a board entry for every @Cron handler', () => {
    const missing = inSource.filter((name) => !onBoard.includes(name));

    expect(missing).toEqual([]);
  });

  it('has no board entry without a handler behind it', () => {
    const orphaned = onBoard.filter((name) => !inSource.includes(name));

    expect(orphaned).toEqual([]);
  });
});
