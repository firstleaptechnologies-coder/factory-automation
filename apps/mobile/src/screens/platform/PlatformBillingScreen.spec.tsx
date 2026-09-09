import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { PlatformBillingScreen } from './PlatformBillingScreen';

const mockBilling = jest.fn();
jest.mock('../../api/client', () => ({ api: { platformBilling: () => mockBilling() } }));

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
  mockBilling.mockResolvedValue(billing());
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

// Nothing is collected here, and the screen must not imply otherwise.
it('says plainly that nothing is collected yet', async () => {
  await mount();

  expect(await screen.findByText(/no payment gateway attached/)).toBeTruthy();
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
