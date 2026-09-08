import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { KIND_ROWS, NOT_A_TRANSACTION } from './payments.service';

/**
 * Every movement of money reaches the Transactions screen, or says why not.
 *
 * The screen's filter names the kinds it wants rather than excluding the ones
 * it does not — which keeps a payout out by construction, and is right. But it
 * turns into a different bug the moment a module posts something nobody adds
 * to the list: purchases posted to the ledger for a day and appeared nowhere,
 * with nothing failing.
 *
 * So this reads the source for every `sourceType` the API actually posts and
 * fails when one is neither on the screen nor deliberately left off it. The
 * exclusions carry their reason, so leaving something out stays a decision
 * somebody wrote down.
 */
const SOURCE = join(__dirname, '..', '..');

/** Every ledger source the code posts, read off the source rather than listed. */
function postedSourceTypes(): string[] {
  const found = execSync(
    `grep -rho "sourceType: '[A-Za-z]*'" ${SOURCE} --include=*.ts || true`,
    { encoding: 'utf8' },
  );
  const types = [...found.matchAll(/sourceType: '([A-Za-z]+)'/g)].map((match) => match[1]);
  return [...new Set(types)].sort();
}

it('reads the sources at all, so a broken grep does not pass silently', () => {
  expect(postedSourceTypes().length).toBeGreaterThan(4);
});

it('shows every movement of money, or says why it does not', () => {
  const onScreen = new Set(Object.values(KIND_ROWS).map((row) => row.sourceType as string));
  const missing = postedSourceTypes().filter(
    (type) => !onScreen.has(type) && !(type in NOT_A_TRANSACTION),
  );
  expect(missing).toEqual([]);
});

it('gives every exclusion a reason somebody wrote down', () => {
  for (const [source, reason] of Object.entries(NOT_A_TRANSACTION)) {
    expect(reason.length).toBeGreaterThan(20);
    expect(source).toBeTruthy();
  }
});

it('keeps payouts off it, which is the exclusion that matters', () => {
  // Folding a payout in would be the netting-off the books must not do.
  const onScreen = Object.values(KIND_ROWS).map((row) => row.sourceType);
  expect(onScreen).not.toContain('Disbursement');
  expect(NOT_A_TRANSACTION.Disbursement).toContain('netting-off');
});
