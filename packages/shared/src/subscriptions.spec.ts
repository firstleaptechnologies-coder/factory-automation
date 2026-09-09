import { MODULES } from './modules';
import { Tier, billFor, effectOfIncluding, monthlyRecurring } from './subscriptions';

const SHOP: Tier = {
  key: 'shop',
  label: 'Shop',
  blurb: 'Punching, the money on it, and where the work comes from',
  monthlyPrice: 8000,
  includedModules: [MODULES.ORDERS, MODULES.CLIENTS, MODULES.LEADS, MODULES.QUOTES, MODULES.FINANCE],
};

const PRICES = {
  [MODULES.EXPENSES]: 500,
  [MODULES.HR]: 1500,
  [MODULES.PURCHASING]: 1200,
  [MODULES.REPORTS]: 900,
};

describe('the monthly bill', () => {
  it('is the tier alone when nothing is added on', () => {
    const bill = billFor(SHOP, [], PRICES);

    expect(bill.monthlyTotal).toBe(8000);
    expect(bill.lines).toHaveLength(1);
    expect(bill.lines[0]).toMatchObject({ kind: 'tier', label: 'Shop', amount: 8000 });
  });

  it('adds a line for every module beyond the tier', () => {
    const bill = billFor(SHOP, [MODULES.EXPENSES, MODULES.HR], PRICES);

    expect(bill.monthlyTotal).toBe(10_000);
    expect(bill.lines.map((l) => l.amount)).toEqual([8000, 500, 1500]);
  });

  // Moving a module into a tier must not quietly start billing for it twice.
  it('does not charge for a module the tier already includes', () => {
    const bill = billFor(SHOP, [MODULES.FINANCE, MODULES.QUOTES], PRICES);

    expect(bill.monthlyTotal).toBe(8000);
    expect(bill.lines).toHaveLength(1);
  });

  // A shop with neither has bought nothing at all; they are never a line.
  it('never charges for the core modules', () => {
    const bill = billFor(SHOP, [MODULES.ORDERS, MODULES.CLIENTS], PRICES);

    expect(bill.lines).toHaveLength(1);
    expect(bill.modules).toContain(MODULES.ORDERS);
    expect(bill.modules).toContain(MODULES.CLIENTS);
  });

  it('gives the core even to a tier that forgot to list it', () => {
    const bare: Tier = { ...SHOP, includedModules: [] };

    expect(billFor(bare, [], PRICES).modules).toEqual([MODULES.ORDERS, MODULES.CLIENTS]);
  });

  // The one a client uses for a year for nothing.
  it('shows an add-on nobody has priced rather than dropping it', () => {
    const bill = billFor(SHOP, [MODULES.ANALYTICS], PRICES);

    expect(bill.unpriced).toEqual([MODULES.ANALYTICS]);
    expect(bill.lines.at(-1)).toMatchObject({ module: MODULES.ANALYTICS, unpriced: true, amount: 0 });
    expect(bill.monthlyTotal).toBe(8000);
  });

  it('charges add-ons in catalogue order, however they were ticked', () => {
    const one = billFor(SHOP, [MODULES.REPORTS, MODULES.EXPENSES, MODULES.HR], PRICES);
    const two = billFor(SHOP, [MODULES.HR, MODULES.REPORTS, MODULES.EXPENSES], PRICES);

    expect(one.lines.map((l) => l.module)).toEqual(two.lines.map((l) => l.module));
  });

  it('refuses to be talked into a negative price', () => {
    const bill = billFor({ ...SHOP, monthlyPrice: -5000 }, [MODULES.HR], { [MODULES.HR]: -900 });

    expect(bill.monthlyTotal).toBe(0);
  });

  it('labels a line with the module’s name when it has one', () => {
    const bill = billFor(SHOP, [MODULES.HR], PRICES, { [MODULES.HR]: 'People' });

    expect(bill.lines.at(-1)?.label).toBe('People');
  });

  it('bills a workspace on no tier for its add-ons alone', () => {
    const bill = billFor(undefined, [MODULES.HR], PRICES);

    expect(bill.monthlyTotal).toBe(1500);
    expect(bill.modules).toEqual([MODULES.ORDERS, MODULES.CLIENTS, MODULES.HR]);
  });
});

describe('what the book is worth', () => {
  // A trial and a suspended workspace are both worth nothing this month.
  it('counts only workspaces that are actually paying', () => {
    const result = monthlyRecurring([
      { status: 'ACTIVE', monthlyTotal: 8000 },
      { status: 'ACTIVE', monthlyTotal: 9500 },
      { status: 'TRIAL', monthlyTotal: 8000 },
      { status: 'SUSPENDED', monthlyTotal: 12_000 },
    ]);

    expect(result).toEqual({ active: 2, total: 17_500 });
  });

  it('is nothing when nobody is paying', () => {
    expect(monthlyRecurring([{ status: 'TRIAL', monthlyTotal: 8000 }])).toEqual({
      active: 0,
      total: 0,
    });
  });
});

describe('moving a module into a tier', () => {
  // Worth knowing before doing it: everyone paying for it as an add-on stops.
  it('says what it costs and who it touches', () => {
    const result = effectOfIncluding(
      MODULES.HR,
      [
        { extras: [MODULES.HR], monthlyTotal: 9500 },
        { extras: [MODULES.HR, MODULES.REPORTS], monthlyTotal: 10_400 },
        { extras: [], monthlyTotal: 8000 },
      ],
      PRICES,
    );

    expect(result).toEqual({ affected: 2, monthlyChange: -3000 });
  });

  it('costs nothing when nobody is on it', () => {
    expect(effectOfIncluding(MODULES.AI, [{ extras: [], monthlyTotal: 8000 }], PRICES)).toEqual({
      affected: 0,
      monthlyChange: 0,
    });
  });
});
