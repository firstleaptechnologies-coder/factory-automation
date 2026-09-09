import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import BillingPage from './page';

const apiMock = {
  platformBilling: jest.fn(),
  billingGateway: jest.fn(),
  billingInvoices: jest.fn(),
  runBilling: jest.fn(),
  issueInvoice: jest.fn(),
  voidInvoice: jest.fn(),
};
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

let permissions: string[] = [];
jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ can: (p: string) => permissions.includes(p) }),
}));

const invoice = (over: Record<string, unknown> = {}) => ({
  id: 'inv_1',
  tenantId: 't1',
  period: '2026-09-01T00:00:00.000Z',
  amount: 8000,
  status: 'DRAFT',
  lines: [{ kind: 'tier', label: 'Shop', amount: 8000 }],
  paymentUrl: null,
  failureReason: null,
  paidAt: null,
  workspace: { id: 't1', name: 'Decor Bucket' },
  ...over,
});

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
  permissions = ['platform.tenant.view', 'platform.pricing.manage'];
  apiMock.platformBilling.mockResolvedValue(billing());
  apiMock.billingGateway.mockResolvedValue({
    provider: 'razorpay',
    connected: true,
    webhooksVerifiable: true,
  });
  apiMock.billingInvoices.mockResolvedValue([invoice()]);
  apiMock.runBilling.mockResolvedValue({ written: 1, skipped: 0 });
  apiMock.issueInvoice.mockResolvedValue(invoice({ status: 'ISSUED' }));
  apiMock.voidInvoice.mockResolvedValue(invoice({ status: 'VOID' }));
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


describe('invoices', () => {
  it('says what a bill was made of, not just what it comes to', async () => {
    await mount();

    expect(await screen.findByText(/Decor Bucket · 2026-09/)).toBeInTheDocument();
    expect(screen.getByText('Shop ₹8,000')).toBeInTheDocument();
  });

  it('works out the month on request', async () => {
    await mount();
    fireEvent.click(screen.getByText('Work out this month'));

    await waitFor(() => expect(apiMock.runBilling).toHaveBeenCalled());
  });

  it('sends one', async () => {
    await mount();
    fireEvent.click(await screen.findByText('Send it'));

    await waitFor(() => expect(apiMock.issueInvoice).toHaveBeenCalledWith('inv_1'));
  });

  /*
   * Without an account behind it, sending would mark a bill issued with
   * nowhere to pay it — an invoice that claims to have been sent and was not.
   */
  it('cannot send anything while no gateway is connected', async () => {
    apiMock.billingGateway.mockResolvedValue({
      provider: 'razorpay',
      connected: false,
      webhooksVerifiable: false,
    });
    await mount();

    expect(await screen.findByText('Send it')).toBeDisabled();
    expect(screen.getByText(/No payment gateway is connected/)).toBeInTheDocument();
  });

  /*
   * Keys without a webhook secret is the worst of the three states: money is
   * collected and never recorded. It must not read as "connected".
   */
  it('warns when payments could be collected and never recorded', async () => {
    apiMock.billingGateway.mockResolvedValue({
      provider: 'razorpay',
      connected: true,
      webhooksVerifiable: false,
    });
    await mount();

    expect(await screen.findByText(/collected and never recorded/)).toBeInTheDocument();
  });

  it('withdraws one, with a reason', async () => {
    await mount();
    fireEvent.click(await screen.findByText('Withdraw'));
    await screen.findByText('Withdraw this bill');
    fireEvent.change(document.querySelector('.sheet input')!, {
      target: { value: 'billed the wrong tier' },
    });
    fireEvent.click(screen.getByText('Withdraw it'));

    await waitFor(() =>
      expect(apiMock.voidInvoice).toHaveBeenCalledWith('inv_1', 'billed the wrong tier'),
    );
  });

  // A paid bill is refunded, not un-billed, and a withdrawn one is finished.
  it('offers neither sending nor withdrawing on one that is settled', async () => {
    apiMock.billingInvoices.mockResolvedValue([invoice({ status: 'PAID' })]);
    await mount();
    await screen.findByText('paid');

    expect(screen.queryByText('Send it')).not.toBeInTheDocument();
    expect(screen.queryByText('Withdraw')).not.toBeInTheDocument();
  });

  it('says why an attempt failed, where somebody will read it', async () => {
    apiMock.billingInvoices.mockResolvedValue([
      invoice({ status: 'FAILED', failureReason: 'Paid ₹5000 against ₹8000. Still owing ₹3000.' }),
    ]);
    await mount();

    expect(await screen.findByText(/Still owing ₹3000/)).toBeInTheDocument();
  });

  it('offers nothing but reading to somebody who may not bill', async () => {
    permissions = ['platform.tenant.view'];
    await mount();
    await screen.findByText(/Decor Bucket · 2026-09/);

    expect(screen.queryByText('Work out this month')).not.toBeInTheDocument();
    expect(screen.queryByText('Send it')).not.toBeInTheDocument();
  });
});
