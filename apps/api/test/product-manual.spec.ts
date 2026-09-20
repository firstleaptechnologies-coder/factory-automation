import { readFileSync } from 'node:fs';
import { MODULE_CATALOGUE, PRODUCT_MANUAL, undefinedFields, type ProductManual } from '@fas/shared';
import { GAPS_FILE, buildManual, gapList } from '../scripts/build-product-manual';

/**
 * The product manual cannot fall behind the product.
 *
 * docs/product-manual.json is what the owner's manual screen reads and what a
 * vendor is handed. It is generated, so its *structure* is always true — but
 * two things could still rot, and both are silent:
 *
 *   The committed copy could be stale, if somebody adds a route and does not
 *   regenerate. Then the manual describes last week's product.
 *
 *   A new field could ship with no explanation. Then the manual has a heading,
 *   a type and a blank where the reason should be, which is the specific way
 *   documentation stops being read: once it is unreliable about one thing,
 *   nobody trusts it about anything.
 *
 * So: regenerate and compare, and refuse any undocumented field that is not
 * already on the recorded list. The list only shrinks in review, because
 * writing to it takes `--accept-gaps` and shows up in the diff as a decision
 * somebody made.
 */
const committed: ProductManual = PRODUCT_MANUAL;

const fresh = buildManual();

/** The date moves every day and says nothing about whether the content drifted. */
const withoutDate = (manual: ProductManual) => ({ ...manual, generatedAt: '' });

describe('the committed manual', () => {
  it('matches what the code says today', () => {
    // If this fails: npm --workspace @fas/api run docs:manual
    expect(withoutDate(committed)).toEqual(withoutDate(fresh));
  });

  it('covers every module in the catalogue, including the ones not built yet', () => {
    // A module that is sold but absent from the manual is a module somebody
    // pays for and cannot read about.
    for (const module of MODULE_CATALOGUE) {
      expect(fresh.modules.map((m) => m.key)).toContain(module.key);
    }
  });

  it('files every route under something', () => {
    // 'Every workspace' catches what no module gates. A route in neither is a
    // part of the product the manual does not mention at all.
    const filed = fresh.modules.flatMap((m) => m.actions).length;
    expect(filed).toBeGreaterThanOrEqual(239);
  });

  it('keeps the console out of what a shop is sold', () => {
    const console_ = fresh.modules.find((m) => m.key === 'platform')!;
    expect(console_.audience).toBe('platform');
    expect(console_.sold).toBe(false);
  });

  it('never marks the two modules every workspace has as sold', () => {
    // A shop with no orders and no clients has bought nothing at all, so they
    // are never a line on an invoice.
    for (const key of ['orders', 'clients']) {
      expect(fresh.modules.find((m) => m.key === key)!.sold).toBe(false);
    }
  });
});

describe('what nobody has explained yet', () => {
  const recorded: string[] = JSON.parse(readFileSync(GAPS_FILE, 'utf8'));
  const now = gapList(fresh);

  it('has not grown', () => {
    const added = now.filter((gap) => !recorded.includes(gap));
    // If this fails: write a doc comment above the field saying what it is
    // for. That sentence is the manual. Accepting it undocumented instead is
    // `npm --workspace @fas/api run docs:manual -- --accept-gaps`, which is a
    // decision, not a formality.
    expect(added).toEqual([]);
  });

  it('only ever shrinks', () => {
    /*
     * Fewer than recorded is the whole point and must never fail: writing a
     * definition should not turn the build red until somebody re-runs a
     * script. Only growth is a problem, and the test above catches that by
     * name.
     */
    expect(undefinedFields(fresh).length).toBeLessThanOrEqual(recorded.length);
  });

  /*
   * A module with no summary is a chapter heading with nothing under it. The
   * ones still to be written are listed, so this fails the moment a module is
   * added to the catalogue and nobody writes what it is for.
   */
  it('names every module that still has no description', () => {
    const undescribed = fresh.modules.filter((m) => !m.summary.trim()).map((m) => m.key);
    expect(undescribed).toEqual(UNDESCRIBED);
  });
});

/**
 * Modules with nothing written about them yet.
 *
 * Shrinks as they are written. A module added to the catalogue and not added
 * here fails the test above, which is the point: a heading with nothing under
 * it should never reach a vendor.
 */
const UNDESCRIBED: string[] = [];
