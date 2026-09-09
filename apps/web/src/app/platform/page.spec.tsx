import { act, fireEvent, render, screen } from '@testing-library/react';
import PlatformOverviewPage from './page';

const apiMock = {
  platformOverview: jest.fn(),
  platformJobHealth: jest.fn(),
  updateTenant: jest.fn(),
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
jest.mock('@/lib/auth', () => ({ useAuth: () => ({ signOut: jest.fn() }) }));

const workspace = (over: Record<string, unknown> = {}) => ({
  id: 'w1',
  slug: 'decorbucket',
  name: 'Decor Bucket',
  status: 'ACTIVE',
  isolation: 'SHARED',
  contactName: 'Nakul',
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
  tiers: [{ key: 'shop', label: 'Shop', blurb: '', monthlyPrice: 8000, includedModules: [], planModules: [], isActive: true }],
  modulePrices: [
    { moduleKey: 'hr', label: 'People', blurb: '', comingSoon: false, monthlyPrice: 0, isPriced: false },
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
  apiMock.platformOverview.mockResolvedValue(overview());
  apiMock.updateTenant.mockResolvedValue({});
  apiMock.platformJobHealth.mockResolvedValue([]);
});

async function draw() {
  await act(async () => {
    render(<PlatformOverviewPage />);
  });
}

it('leads with what the book is worth', async () => {
  await draw();

  expect(screen.getByText('Monthly recurring')).toBeInTheDocument();
  expect(screen.getByText(/from 1 paying client$/)).toBeInTheDocument();
});

it('lists each client with what they are on and what they pay', async () => {
  await draw();

  expect(screen.getByText('Decor Bucket')).toBeInTheDocument();
  expect(screen.getByText(/decorbucket · Shop/)).toBeInTheDocument();
});

// A client on a plan key no tier matches cannot be billed at all, and nothing
// else in the product would ever say so.
it('marks a workspace whose plan matches no tier', async () => {
  apiMock.platformOverview.mockResolvedValue(
    overview({
      workspaces: [workspace({ slug: 'woodcraft', name: 'Woodcraft', unknownPlan: true, tierLabel: null })],
      totals: { ...overview().totals, unknownPlans: 1 },
    }),
  );

  await draw();

  expect(screen.getByText('unknown plan')).toBeInTheDocument();
  expect(screen.getByText('Money nobody is collecting')).toBeInTheDocument();
});

it('counts how many of a client’s modules nobody has priced', async () => {
  apiMock.platformOverview.mockResolvedValue(
    overview({
      workspaces: [
        workspace({
          extras: ['hr'],
          bill: { lines: [], modules: ['orders'], unpriced: ['hr'], monthlyTotal: 8000 },
        }),
      ],
    }),
  );

  await draw();

  expect(screen.getByText('1 unpriced')).toBeInTheDocument();
});

it('says nothing alarming when everything is priced', async () => {
  await draw();

  expect(screen.queryByText('Money nobody is collecting')).not.toBeInTheDocument();
});

it('goes to the price list', async () => {
  await draw();

  expect(screen.getByText('Plans and prices')).toBeInTheDocument();
});

describe('editing what a client is on', () => {
  async function openEditor() {
    await draw();
    await act(async () => {
      fireEvent.click(screen.getByText('Decor Bucket'));
    });
  }

  it('opens on the client that was clicked', async () => {
    await openEditor();

    expect(screen.getByText('What they are on, and what it comes to')).toBeInTheDocument();
  });

  // A module the tier already covers is not an add-on, and offering it as one
  // would read as something the client is being charged for.
  it('shows a module the tier covers as included rather than as an add-on', async () => {
    apiMock.platformOverview.mockResolvedValue(
      overview({
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
      }),
    );

    await openEditor();

    expect(screen.getByText('Leads (in tier)')).toBeInTheDocument();
  });

  it('sends the tier and the add-ons together', async () => {
    await openEditor();
    await act(async () => {
      fireEvent.click(screen.getByText('People'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    expect(apiMock.updateTenant).toHaveBeenCalledWith('w1', {
      plan: 'shop',
      modules: ['hr'],
    });
  });
});

describe('work on a clock', () => {
  const health = (over: Record<string, unknown> = {}) => ({
    job: {
      name: 'ledger.reconcile',
      label: 'Reconcile the ledger',
      blurb: 'Posts anything that moved money and never reached the ledger.',
      cadence: 'daily',
    },
    state: 'ok',
    lastRun: null,
    sinceMs: 1000,
    summary: 'Ran 6 hours ago.',
    ...over,
  });

  it('says nothing about jobs when there are none to report', async () => {
    await draw();

    expect(screen.queryByText('Work on a clock')).not.toBeInTheDocument();
  });

  it('lists each job with what it is for', async () => {
    apiMock.platformJobHealth.mockResolvedValue([health()]);

    await draw();

    expect(screen.getByText('Reconcile the ledger')).toBeInTheDocument();
    expect(screen.getByText('Ran 6 hours ago.')).toBeInTheDocument();
  });

  // A job that stopped is the failure nothing else in the product would
  // mention, so it is called out above the list rather than left to be found.
  it('calls out a job that is not running', async () => {
    apiMock.platformJobHealth.mockResolvedValue([
      health({ state: 'overdue', summary: 'Last ran 3 days ago, and should have run since.' }),
    ]);

    await draw();

    expect(screen.getByText(/Reconcile the ledger is not running/)).toBeInTheDocument();
    expect(screen.getByText('overdue')).toBeInTheDocument();
  });

  it('says nothing alarming when every job is healthy', async () => {
    apiMock.platformJobHealth.mockResolvedValue([health()]);

    await draw();

    expect(screen.queryByText(/is not running/)).not.toBeInTheDocument();
  });
});
