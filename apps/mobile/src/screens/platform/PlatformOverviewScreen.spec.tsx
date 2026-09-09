import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { PlatformOverviewScreen } from './PlatformOverviewScreen';

const mockOverview = jest.fn();
const mockUpdateTenant = jest.fn();
jest.mock('../../api/client', () => ({
  api: {
    platformOverview: (...a: unknown[]) => mockOverview(...a),
    updateTenant: (...a: unknown[]) => mockUpdateTenant(...a),
  },
}));

jest.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ signOut: jest.fn() }) }));

const navigation = { navigate: jest.fn(), goBack: jest.fn() };

const workspace = (over: Record<string, unknown> = {}) => ({
  id: 'w1',
  slug: 'decorbucket',
  name: 'Decor Bucket',
  status: 'ACTIVE',
  isolation: 'SHARED',
  contactName: null,
  createdAt: '2026-09-01',
  tier: 'shop',
  tierLabel: 'Shop',
  unknownPlan: false,
  extras: [],
  bill: { lines: [], modules: ['orders', 'clients'], unpriced: [], monthlyTotal: 8000 },
  ...over,
});

const overview = (over: Record<string, unknown> = {}) => ({
  workspaces: [workspace()],
  tiers: [
    {
      key: 'shop',
      label: 'Shop',
      blurb: '',
      monthlyPrice: 8000,
      includedModules: ['orders', 'clients', 'leads'],
      planModules: [],
      isActive: true,
    },
  ],
  modulePrices: [
    { moduleKey: 'hr', label: 'People', blurb: '', comingSoon: false, monthlyPrice: 1500, isPriced: true },
  ],
  totals: {
    workspaces: 1,
    byStatus: { ACTIVE: 1, TRIAL: 0, SUSPENDED: 0 },
    monthlyRecurring: 8000,
    paying: 1,
    unpricedModules: [],
    unknownPlans: 0,
  },
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockOverview.mockResolvedValue(overview());
  mockUpdateTenant.mockResolvedValue({});
});

it('leads with what the book is worth', async () => {
  render(<PlatformOverviewScreen navigation={navigation} />);

  await waitFor(() => expect(screen.getByText('Monthly recurring')).toBeTruthy());
  expect(screen.getByText(/from 1 paying client/)).toBeTruthy();
});

it('lists each client with what they are on', async () => {
  render(<PlatformOverviewScreen navigation={navigation} />);

  await waitFor(() => expect(screen.getByText('Decor Bucket')).toBeTruthy());
  expect(screen.getByText(/decorbucket · Shop/)).toBeTruthy();
});

// Money nobody is collecting, and nothing else in the product would say so.
it('warns when a workspace is on a plan key that matches no tier', async () => {
  mockOverview.mockResolvedValue(
    overview({ totals: { ...overview().totals, unknownPlans: 1 } }),
  );
  render(<PlatformOverviewScreen navigation={navigation} />);

  await waitFor(() => expect(screen.getByText('Money nobody is collecting')).toBeTruthy());
});

it('goes to the price list', async () => {
  render(<PlatformOverviewScreen navigation={navigation} />);

  await waitFor(() => expect(screen.getByText('Plans and prices')).toBeTruthy());
  fireEvent.press(screen.getByText('Plans and prices'));

  expect(navigation.navigate).toHaveBeenCalledWith('PlatformPlans');
});

describe('editing what a client is on', () => {
  async function openEditor() {
    render(<PlatformOverviewScreen navigation={navigation} />);
    await waitFor(() => expect(screen.getByText('Decor Bucket')).toBeTruthy());
    fireEvent.press(screen.getByText('Decor Bucket'));
    await waitFor(() =>
      expect(screen.getByText('What they are on, and what it comes to')).toBeTruthy(),
    );
  }

  // A module the tier covers is not an add-on, and offering it as one reads as
  // something the client is charged for when they are not.
  it('shows a module the tier covers as included', async () => {
    await openEditor();

    expect(screen.getByText('Leads (in tier)')).toBeTruthy();
  });

  it('previews the new bill before it is saved', async () => {
    await openEditor();
    fireEvent.press(screen.getByText('People'));

    await waitFor(() => expect(screen.getByText(/Not saved yet/)).toBeTruthy());
    expect(screen.getByText('₹9,500')).toBeTruthy();
  });

  it('sends the tier and the add-ons together', async () => {
    await openEditor();
    fireEvent.press(screen.getByText('People'));
    // Wait for the toggle to land before saving: pressing both in one tick
    // sends the state as it was, which is exactly the bug a user would hit
    // tapping quickly.
    await waitFor(() => expect(screen.getByText(/Not saved yet/)).toBeTruthy());

    fireEvent.press(screen.getByText('Save'));

    await waitFor(() =>
      expect(mockUpdateTenant).toHaveBeenCalledWith('w1', { plan: 'shop', modules: ['hr'] }),
    );
  });
});
