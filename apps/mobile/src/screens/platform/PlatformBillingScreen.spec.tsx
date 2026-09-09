import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { PlatformBillingScreen } from './PlatformBillingScreen';

const mockBilling = jest.fn();
const mockGateway = jest.fn();
const mockInvoices = jest.fn();
const mockRun = jest.fn();
const mockIssue = jest.fn();
const mockVoid = jest.fn();
jest.mock('../../api/client', () => ({
  api: {
    platformBilling: () => mockBilling(),
    billingGateway: () => mockGateway(),
    billingInvoices: () => mockInvoices(),
    runBilling: () => mockRun(),
    issueInvoice: (...a: unknown[]) => mockIssue(...a),
    voidInvoice: (...a: unknown[]) => mockVoid(...a),
  },
}));

let mockPermissions: string[] = [];
jest.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({ can: (p: string) => mockPermissions.includes(p) }),
}));

const invoice = (over: Record<string, unknown> = {}) => ({
  id: 'inv_1',
  period: '2026-09-01T00:00:00.000Z',
  amount: 8000,
  status: 'DRAFT',
  lines: [{ kind: 'tier', label: 'Shop', amount: 8000 }],
  paymentUrl: null,
  failureReason: null,
  workspace: { id: 't1', name: 'Decor Bucket' },
  ...over,
});

const row = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  name: 'Decor Bucket',
  status: 'ACTIVE',
  isInternal: false,
  tierLabel: 'Shop',
  monthlyTotal: 9500,
  unpriced: [],
  trialDaysLeft: null,
  billingDay: 5,
  ...over,
});

const billing = (over: Record<string, unknown> = {}) => ({
  rows: [row()],
  totals: { monthlyRecurring: 9500, paying: 1, onTrial: 0, suspended: 0, internal: 0 },
  needsAttention: {
    trialsExpired: [],
    trialsEndingSoon: [],
    trialsWithNoEnd: [],
    unpriced: [],
    payingNothing: [],
  },
  ...over,
});

const navigation = { goBack: jest.fn(), navigate: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockPermissions = ['platform.tenant.view', 'platform.pricing.manage'];
  mockBilling.mockResolvedValue(billing());
  mockGateway.mockResolvedValue({ provider: 'razorpay', connected: true, webhooksVerifiable: true });
  mockInvoices.mockResolvedValue([invoice()]);
  mockRun.mockResolvedValue({ written: 1, skipped: 0 });
  mockIssue.mockResolvedValue(invoice({ status: 'ISSUED' }));
  mockVoid.mockResolvedValue(invoice({ status: 'VOID' }));
});

const mount = async () => {
  await render(<PlatformBillingScreen navigation={navigation as never} />);
  await waitFor(() => expect(mockBilling).toHaveBeenCalled());
};

it('leads with what is actually recurring', async () => {
  await mount();

  // The headline and the one workspace behind it both say ₹9,500 — which is
  // the point: the total is the rows added up, not a second figure.
  expect(await screen.findAllByText('₹9,500')).toHaveLength(2);
  expect(screen.getByText(/from 1 paying client/)).toBeTruthy();
});

it('says so plainly when there is nothing to chase', async () => {
  await mount();

  expect(await screen.findByText(/Nothing is expiring, unpriced or quietly free/)).toBeTruthy();
});

/*
 * The reason this screen exists. A trial that ran out is invisible in a list
 * sorted by name, and every day it stays open is the product given away by
 * accident rather than on purpose.
 */
it('puts a trial that has run out in front of everything else', async () => {
  mockBilling.mockResolvedValue(
    billing({
      needsAttention: {
        trialsExpired: [row({ name: 'Woodcraft', status: 'TRIAL', trialDaysLeft: -12 })],
        trialsEndingSoon: [],
        trialsWithNoEnd: [],
        unpriced: [],
        payingNothing: [],
      },
    }),
  );
  await mount();

  expect(await screen.findByText('Trials that have run out')).toBeTruthy();
});

it('names the add-ons nobody has priced, rather than just counting them', async () => {
  mockBilling.mockResolvedValue(
    billing({
      needsAttention: {
        trialsExpired: [],
        trialsEndingSoon: [],
        trialsWithNoEnd: [],
        unpriced: [row({ unpriced: ['hr'] })],
        payingNothing: [],
      },
    }),
  );
  await mount();

  expect(await screen.findByText('Decor Bucket · People')).toBeTruthy();
});

it('goes to the workspace behind a line', async () => {
  await mount();
  await fireEvent.press(await screen.findByText('Decor Bucket'));

  expect(navigation.navigate).toHaveBeenCalledWith('TenantDetail', { id: 't1' });
});




// Ours is ACTIVE and on every module, which is exactly what a paying client
// looks like from here.
describe('a workspace of our own', () => {
  beforeEach(() => {
    mockBilling.mockResolvedValue(
      billing({
        rows: [row(), row({ id: 't2', name: 'FirstLeap (FLT)', isInternal: true, monthlyTotal: 15000 })],
        totals: { monthlyRecurring: 9500, paying: 1, onTrial: 0, suspended: 0, internal: 1 },
      }),
    );
  });

  it('says how many are ours, beside the ones that are not', async () => {
    await mount();

    expect(await screen.findByText(/1 of ours, counted nowhere/)).toBeTruthy();
  });

  it('does not show ours as an amount coming in', async () => {
    await mount();
    await screen.findByText('FirstLeap (FLT)');

    expect(screen.getByText('ours')).toBeTruthy();
    expect(screen.queryByText('₹15,000')).toBeNull();
  });
});


describe('invoices', () => {
  it('says what a bill was made of, not just what it comes to', async () => {
    await mount();

    expect(await screen.findByText(/Decor Bucket · 2026-09/)).toBeTruthy();
    expect(screen.getByText('Shop ₹8,000')).toBeTruthy();
  });

  it('sends one', async () => {
    await mount();
    await fireEvent.press(await screen.findByText('Send it'));

    await waitFor(() => expect(mockIssue).toHaveBeenCalledWith('inv_1'));
  });

  // Without an account behind it, sending would mark a bill issued with
  // nowhere to pay it.
  it('cannot send anything while no gateway is connected', async () => {
    mockGateway.mockResolvedValue({ provider: 'razorpay', connected: false, webhooksVerifiable: false });
    await mount();
    await fireEvent.press(await screen.findByText('Send it'));

    expect(mockIssue).not.toHaveBeenCalled();
    expect(screen.getByText(/No payment gateway is connected/)).toBeTruthy();
  });

  // Keys without a webhook secret is the worst of the three states: money is
  // collected and never recorded.
  it('warns when payments could be collected and never recorded', async () => {
    mockGateway.mockResolvedValue({ provider: 'razorpay', connected: true, webhooksVerifiable: false });
    await mount();

    expect(await screen.findByText(/collected and never recorded/)).toBeTruthy();
  });

  it('offers no sending on one that is settled', async () => {
    mockInvoices.mockResolvedValue([invoice({ status: 'PAID' })]);
    await mount();
    await screen.findByText('paid');

    expect(screen.queryByText('Send it')).toBeNull();
  });

  it('offers nothing but reading to somebody who may not bill', async () => {
    mockPermissions = ['platform.tenant.view'];
    await mount();
    await screen.findByText(/Decor Bucket · 2026-09/);

    expect(screen.queryByText('Work out this month')).toBeNull();
    expect(screen.queryByText('Send it')).toBeNull();
  });
});


// Never deleted — a bill that was sent and withdrawn happened.
describe('withdrawing a bill', () => {
  it('asks why, and sends it', async () => {
    await mount();
    await fireEvent.press(await screen.findByText('Withdraw'));
    await fireEvent.changeText(
      await screen.findByPlaceholderText('Billed the wrong tier'),
      'billed the wrong tier',
    );
    await fireEvent.press(screen.getByText('Withdraw it'));

    await waitFor(() => expect(mockVoid).toHaveBeenCalledWith('inv_1', 'billed the wrong tier'));
  });

  // A paid bill is refunded, not un-billed.
  it('is not offered on one that is settled', async () => {
    mockInvoices.mockResolvedValue([invoice({ status: 'PAID' })]);
    await mount();
    await screen.findByText('paid');

    expect(screen.queryByText('Withdraw')).toBeNull();
  });
});
