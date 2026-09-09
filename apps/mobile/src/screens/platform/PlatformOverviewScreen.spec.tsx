import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { PlatformOverviewScreen } from './PlatformOverviewScreen';

const mockOverview = jest.fn();
const mockUpdateTenant = jest.fn();
const mockJobHealth = jest.fn();
jest.mock('../../api/client', () => ({
  api: {
    platformOverview: (...a: unknown[]) => mockOverview(...a),
    updateTenant: (...a: unknown[]) => mockUpdateTenant(...a),
    platformJobHealth: (...a: unknown[]) => mockJobHealth(...a),
  },
}));

const mockSignOut = jest.fn();
let mockPermissions: string[] = [];
jest.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({ signOut: mockSignOut, can: (p: string) => mockPermissions.includes(p) }),
}));

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
  mockPermissions = [
    'platform.tenant.view',
    'platform.staff.view',
    'platform.release.view',
  ];
  mockOverview.mockResolvedValue(overview());
  mockUpdateTenant.mockResolvedValue({});
  mockJobHealth.mockResolvedValue([]);
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

// The label comes from the shared navigation tree now, so it reads the same
// here as it does in the browser's sidebar.
it('goes to the price list', async () => {
  render(<PlatformOverviewScreen navigation={navigation} />);

  await waitFor(() => expect(screen.getByText('Tiers and prices')).toBeTruthy());
  fireEvent.press(screen.getByText('Tiers and prices'));

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

describe('work on a clock', () => {
  const health = (over: Record<string, unknown> = {}) => ({
    job: { name: 'ledger.reconcile', label: 'Reconcile the ledger', blurb: '', cadence: 'daily' },
    state: 'ok',
    lastRun: null,
    sinceMs: 1000,
    summary: 'Ran 6 hours ago.',
    ...over,
  });

  it('lists each job and what it did', async () => {
    mockJobHealth.mockResolvedValue([health()]);
    render(<PlatformOverviewScreen navigation={navigation} />);

    await waitFor(() => expect(screen.getByText('Reconcile the ledger')).toBeTruthy());
    expect(screen.getByText('Ran 6 hours ago.')).toBeTruthy();
  });

  // The failure nothing else would mention.
  it('calls out a job that is not running', async () => {
    mockJobHealth.mockResolvedValue([health({ state: 'overdue', summary: 'Last ran 3 days ago.' })]);
    render(<PlatformOverviewScreen navigation={navigation} />);

    await waitFor(() =>
      expect(screen.getByText(/Reconcile the ledger is not running/)).toBeTruthy(),
    );
  });
});


/*
 * The console's menu, read from the same tree the browser's sidebar reads.
 *
 * Hard-coded buttons is how the two clients drifted before: this screen
 * offered two of the six places the console has, and nothing failed.
 */
describe('the console menu', () => {
  const mount = async () => {
    await render(<PlatformOverviewScreen navigation={navigation} />);
    await waitFor(() => expect(mockOverview).toHaveBeenCalled());
  };

  it('offers every screen the console has', async () => {
    await mount();

    for (const label of ['Workspaces', 'Tiers and prices', 'Billing', 'Staff and roles', 'Releases']) {
      expect(await screen.findByText(label)).toBeTruthy();
    }
  });

  it('does not offer the screen you are already on', async () => {
    await mount();
    await screen.findByText('Workspaces');

    expect(screen.queryByText('Overview')).toBeNull();
  });

  it('goes where a menu item says', async () => {
    await mount();
    await fireEvent.press(await screen.findByText('Staff and roles'));

    expect(navigation.navigate).toHaveBeenCalledWith('PlatformStaff');
  });

  // The API refuses the route either way, but a menu full of screens that say
  // no is not a product.
  it('leaves out what this person may not do', async () => {
    mockPermissions = ['platform.tenant.view'];
    await mount();
    await screen.findByText('Workspaces');

    expect(screen.queryByText('Staff and roles')).toBeNull();
    expect(screen.queryByText('Releases')).toBeNull();
  });

  it('drops a whole heading when nothing under it is reachable', async () => {
    mockPermissions = ['platform.tenant.view'];
    await mount();
    await screen.findByText('Workspaces');

    expect(screen.queryByText('Ourselves')).toBeNull();
  });
});
