import { fireEvent, render, screen } from '@testing-library/react';
import BillingPage from './page';

const apiMock = { platformBilling: jest.fn() };
jest.mock('@/lib/api', () => ({
  api: new Proxy(
    {},
    {
      get: (_t, key: string) => (...args: unknown[]) =>
        apiMock[key as keyof typeof apiMock](...(args as [])),
    },
  ),
}));

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const row = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  name: 'Decor Bucket',
  slug: 'decorbucket',
  status: 'ACTIVE',
  plan: 'shop',
  isInternal: false,
  tierLabel: 'Shop',
  monthlyTotal: 9500,
  unpriced: [],
  trialEndsAt: null,
  trialDaysLeft: null,
  billingDay: 5,
  ...over,
});

const empty = {
  trialsExpired: [],
  trialsEndingSoon: [],
  trialsWithNoEnd: [],
  unpriced: [],
  payingNothing: [],
};

const billing = (over: Record<string, unknown> = {}) => ({
  rows: [row()],
  totals: { monthlyRecurring: 9500, paying: 1, onTrial: 0, suspended: 0, internal: 0 },
  needsAttention: empty,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  apiMock.platformBilling.mockResolvedValue(billing());
});

const mount = async () => {
  render(<BillingPage />);
  await screen.findByText('Billing');
};

it('leads with what is actually recurring', async () => {
  await mount();

  // The headline and the one workspace behind it both say ₹9,500, which is the
  // point: the total is the rows added up, not a second figure.
  expect(screen.getAllByText('₹9,500')).toHaveLength(2);
  expect(screen.getByText(/from 1 paying client/)).toBeInTheDocument();
});

it('says so plainly when there is nothing to chase', async () => {
  await mount();

  expect(screen.getByText(/Nothing is expiring, unpriced or quietly free/)).toBeInTheDocument();
});

/*
 * The reason this screen exists. A trial that ran out is invisible in a list
 * sorted by name, and every day it stays open is the product given away by
 * accident rather than on purpose.
 */
it('puts a trial that has run out in front, and says how long ago', async () => {
  apiMock.platformBilling.mockResolvedValue(
    billing({
      needsAttention: {
        ...empty,
        trialsExpired: [row({ id: 't2', name: 'Woodcraft', status: 'TRIAL', trialDaysLeft: -12 })],
      },
    }),
  );
  await mount();

  expect(screen.getByText('Trials that have run out')).toBeInTheDocument();
  expect(screen.getByText(/Woodcraft · 12 days ago/)).toBeInTheDocument();
});

it('counts the days left on one ending soon', async () => {
  apiMock.platformBilling.mockResolvedValue(
    billing({
      needsAttention: {
        ...empty,
        trialsEndingSoon: [row({ id: 't3', name: 'Woodcraft', status: 'TRIAL', trialDaysLeft: 3 })],
      },
    }),
  );
  await mount();

  expect(screen.getByText(/Woodcraft · 3 days/)).toBeInTheDocument();
});

// A trial without a date never ends, and nobody ever notices.
it('flags a trial with no end date at all', async () => {
  apiMock.platformBilling.mockResolvedValue(
    billing({
      needsAttention: { ...empty, trialsWithNoEnd: [row({ status: 'TRIAL' })] },
    }),
  );
  await mount();

  expect(screen.getByText('Trials with no end date')).toBeInTheDocument();
});

it('names the add-ons nobody has priced, rather than just counting them', async () => {
  apiMock.platformBilling.mockResolvedValue(
    billing({ needsAttention: { ...empty, unpriced: [row({ unpriced: ['hr'] })] } }),
  );
  await mount();

  expect(screen.getByText(/Decor Bucket · People/)).toBeInTheDocument();
});

it('goes to the workspace behind a line', async () => {
  await mount();
  fireEvent.click(screen.getByText('Decor Bucket'));

  expect(push).toHaveBeenCalledWith('/platform/tenants/t1');
});

// Nothing is collected here, and the screen must not imply otherwise.
it('says plainly that nothing is collected yet', async () => {
  await mount();

  expect(screen.getByText(/no payment gateway attached/)).toBeInTheDocument();
});


/*
 * Ours is ACTIVE and on every module, which is exactly what a paying client
 * looks like from here. The revenue figure must not include it, and the row
 * must not read as money coming in.
 */
describe('a workspace of our own', () => {
  const withOurs = () =>
    apiMock.platformBilling.mockResolvedValue(
      billing({
        rows: [
          row(),
          row({ id: 't2', name: 'FirstLeap (FLT)', slug: 'flt', isInternal: true, monthlyTotal: 15000 }),
        ],
        totals: { monthlyRecurring: 9500, paying: 1, onTrial: 0, suspended: 0, internal: 1 },
      }),
    );

  it('says how many are ours, beside the ones that are not', async () => {
    withOurs();
    await mount();

    expect(screen.getByText(/1 of ours, counted nowhere/)).toBeInTheDocument();
  });

  it('marks the row as ours rather than as active', async () => {
    withOurs();
    await mount();

    expect(screen.getByText('internal')).toBeInTheDocument();
  });

  // Hiding the figure loses the answer to "what would we charge for this", so
  // it is shown struck through instead.
  it('still says what it would be worth, struck through', async () => {
    withOurs();
    await mount();

    const amount = screen.getByText('₹15,000');
    expect(amount).toHaveStyle({ textDecoration: 'line-through' });
  });

  it('leaves the headline as what clients actually pay', async () => {
    withOurs();
    await mount();

    expect(screen.getByText(/from 1 paying client/)).toBeInTheDocument();
  });
});
