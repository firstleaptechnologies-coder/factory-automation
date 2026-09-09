import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PERMISSIONS } from '@fas/shared';
import TenantsPage from './page';

const apiMock = { tenants: jest.fn(), createTenant: jest.fn(), updateTenant: jest.fn() };
jest.mock('@/lib/api', () => ({
  api: new Proxy(
    {},
    {
      get: (_t, key: string) => (...args: unknown[]) =>
        apiMock[key as keyof typeof apiMock](...args),
    },
  ),
}));

const replace = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: jest.fn() }) }));

const signOut = jest.fn();
const openWorkspace = jest.fn();
let granted: string[] = [];
let auth: Record<string, unknown>;
jest.mock('@/lib/auth', () => ({ useAuth: () => auth }));

const TENANT = {
  id: 't1',
  slug: 'decorbucket',
  name: 'Decor Bucket',
  status: 'ACTIVE',
  hasDedicatedDatabase: false,
  createdAt: '2026-08-01T00:00:00.000Z',
  counts: { users: 3, orders: 12, clients: 5, unreachable: false },
  plan: 'shop',
  modules: [] as string[],
  effectiveModules: ['orders', 'clients', 'leads', 'quotes', 'finance'],
};

const field = (label: string) =>
  Array.from(document.querySelectorAll('label.field'))
    .find((node) => node.querySelector('.field-label')?.textContent?.startsWith(label))!
    .querySelector('input') as HTMLInputElement;

async function mount(rows: unknown[] = [TENANT]) {
  apiMock.tenants.mockResolvedValue(rows);
  render(<TenantsPage />);
  await screen.findByText('Workspaces');
}

beforeEach(() => {
  jest.clearAllMocks();
  granted = [PERMISSIONS.PLATFORM_IMPERSONATE];
  auth = {
    user: { id: 'p1', isPlatform: true },
    loading: false,
    signOut,
    can: (permission: string) => granted.includes(permission),
    openWorkspace,
  };
  apiMock.updateTenant.mockResolvedValue({});
  // The list is fetched whoever is looking, so it always needs an answer.
  apiMock.tenants.mockResolvedValue([]);
  apiMock.createTenant.mockResolvedValue({});
});

describe('who may be here', () => {
  it('waits rather than bouncing somebody whose session is still loading', async () => {
    auth = { user: null, loading: true, signOut };
    render(<TenantsPage />);
    expect(replace).not.toHaveBeenCalled();
  });

  it('sends anybody signed out to the sign-in screen', async () => {
    auth = { user: null, loading: false, signOut };
    render(<TenantsPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
  });

  it('sends a shop user back to their own shop', async () => {
    auth = { user: { id: 'u1', isPlatform: false }, loading: false, signOut };
    render(<TenantsPage />);
    // The control plane is not theirs; their screens read a tenant.
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
  });

});

describe('the workspaces', () => {
  it('says how many are on the platform', async () => {
    await mount([TENANT, { ...TENANT, id: 't2', slug: 'woodcraft' }]);
    expect(screen.getByText('2 on the platform')).toBeInTheDocument();
  });

  it('shows each with the slug its staff sign in with', async () => {
    await mount();
    expect(screen.getByText('Decor Bucket')).toBeInTheDocument();
    expect(screen.getByText(/decorbucket · created/)).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
  });

  it('says whether a workspace shares the database or has its own', async () => {
    await mount([TENANT, { ...TENANT, id: 't2', hasDedicatedDatabase: true }]);
    expect(screen.getByText('Shared')).toBeInTheDocument();
    expect(screen.getByText('Own database')).toBeInTheDocument();
  });

  it('counts what is inside each one', async () => {
    await mount();
    expect(screen.getByText('3 users · 12 orders · 5 clients')).toBeInTheDocument();
  });

  it('says so rather than showing zeroes when a database cannot be reached', async () => {
    await mount([{ ...TENANT, counts: { unreachable: true } }]);
    // Zeroes would read as an empty shop rather than a broken connection.
    expect(screen.getByText('Database unreachable')).toBeInTheDocument();
  });

  it('says so when there are none yet', async () => {
    await mount([]);
    expect(screen.getByText('No workspaces yet')).toBeInTheDocument();
  });
});

describe('creating a workspace', () => {
  const openSheet = async () => {
    await mount();
    fireEvent.click(screen.getByText('New workspace'));
    await screen.findByText('Seeded with a working shop the owner then edits');
  };

  const fill = () => {
    fireEvent.change(field('Workspace name'), { target: { value: 'Woodcraft Studio' } });
    fireEvent.change(field('Name'), { target: { value: 'Anil' } });
    fireEvent.change(field('Password'), { target: { value: 'secret123' } });
  };

  it('suggests a slug from the name, safe to type', async () => {
    await openSheet();
    fireEvent.change(field('Workspace name'), { target: { value: 'Woodcraft Studio!' } });
    expect(field('Sign-in slug')).toHaveValue('woodcraftstudio');
  });

  it('says what the slug is for', async () => {
    await openSheet();
    expect(screen.getByText('What their staff type on the sign-in screen.')).toBeInTheDocument();
  });

  it('will not create one until everything it needs is there', async () => {
    await openSheet();
    expect(screen.getByText('Create workspace')).toBeDisabled();
    fill();
    expect(screen.getByText('Create workspace')).toBeEnabled();
  });

  it('creates it with the owner who will sign in first', async () => {
    await openSheet();
    fill();
    fireEvent.click(screen.getByText('Create workspace'));
    await waitFor(() => expect(apiMock.createTenant).toHaveBeenCalled());
    expect(apiMock.createTenant.mock.calls[0][0]).toEqual({
      slug: 'woodcraftstudio',
      name: 'Woodcraft Studio',
      isolation: 'SHARED',
      databaseUrl: undefined,
      ownerName: 'Anil',
      ownerCode: 'ADMIN',
      ownerPassword: 'secret123',
    });
  });

  it('upper-cases the owner’s employee code', async () => {
    await openSheet();
    fill();
    fireEvent.change(field('Employee code'), { target: { value: 'owner' } });
    fireEvent.click(screen.getByText('Create workspace'));
    await waitFor(() => expect(apiMock.createTenant).toHaveBeenCalled());
    expect(apiMock.createTenant.mock.calls[0][0].ownerCode).toBe('OWNER');
  });

  it('asks for a database URL only when the workspace gets its own', async () => {
    await openSheet();
    expect(screen.queryByText('Database URL')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Their own database'));
    expect(screen.getByText('Database URL')).toBeInTheDocument();
    expect(screen.getByText('Stored encrypted and never returned by the API.')).toBeInTheDocument();
  });

  it('will not create a dedicated workspace without somewhere to put it', async () => {
    await openSheet();
    fill();
    fireEvent.click(screen.getByText('Their own database'));
    expect(screen.getByText('Create workspace')).toBeDisabled();
  });

  it('sends the database URL for a dedicated workspace', async () => {
    await openSheet();
    fill();
    fireEvent.click(screen.getByText('Their own database'));
    fireEvent.change(field('Database URL'), {
      target: { value: ' postgres://host/db ' },
    });
    fireEvent.click(screen.getByText('Create workspace'));
    await waitFor(() => expect(apiMock.createTenant).toHaveBeenCalled());
    expect(apiMock.createTenant.mock.calls[0][0]).toMatchObject({
      isolation: 'DEDICATED',
      databaseUrl: 'postgres://host/db',
    });
  });

  it('re-reads the list and empties the sheet afterwards', async () => {
    await openSheet();
    fill();
    fireEvent.click(screen.getByText('Create workspace'));
    await waitFor(() => expect(apiMock.tenants).toHaveBeenCalledTimes(2));
  });

  it('says why one was refused, and keeps what was typed', async () => {
    apiMock.createTenant.mockRejectedValue(new Error('That slug is taken'));
    await openSheet();
    fill();
    fireEvent.click(screen.getByText('Create workspace'));
    expect(await screen.findByText('That slug is taken')).toBeInTheDocument();
    expect(field('Workspace name')).toHaveValue('Woodcraft Studio');
  });
});


/**
 * What a workspace has bought.
 *
 * A plan, plus anything granted on top of it — a shop that wants one thing
 * from the next tier up should not have to buy the tier.
 */
describe('a workspace’s plan', () => {
  const openPlan = async () => {
    await mount();
    fireEvent.click((await screen.findAllByText('Plan'))[0]);
    await screen.findByText('A plan, plus anything granted on top of it');
  };

  it('says what each one is on', async () => {
    await mount();
    expect(await screen.findByTestId('tenant-plan')).toHaveTextContent('Shop · 5 modules');
  });

  it('offers the plans, and what each one is for', async () => {
    await openPlan();
    expect(screen.getByText('Punch')).toBeInTheDocument();
    expect(screen.getByText('Works')).toBeInTheDocument();
  });

  it('offers only the modules the plan does not already hold', async () => {
    await openPlan();
    // Offering to add what they already have is offering nothing.
    expect(screen.queryByText('Orders')).not.toBeInTheDocument();
    expect(screen.getByText('People')).toBeInTheDocument();
    expect(screen.getByText('Purchasing')).toBeInTheDocument();
    // Reports is the next module still to come.
    expect(screen.getByText('Reports (soon)')).toBeInTheDocument();
  });

  it('saves the plan and the extras together', async () => {
    await openPlan();
    fireEvent.click(screen.getByText('Works'));
    await act(async () => {
      fireEvent.click(screen.getByText('Save the plan'));
    });

    expect(apiMock.updateTenant).toHaveBeenCalledWith('t1', { plan: 'works', modules: [] });
  });

  it('grants one module without moving the tier', async () => {
    await openPlan();
    fireEvent.click(screen.getByText('People'));
    await act(async () => {
      fireEvent.click(screen.getByText('Save the plan'));
    });

    expect(apiMock.updateTenant).toHaveBeenCalledWith('t1', { plan: 'shop', modules: ['hr'] });
  });
});


/**
 * Opening a workspace to help.
 *
 * The one platform power that reaches inside a shop's data, so the screen makes
 * it deliberate rather than convenient.
 */
describe('opening a workspace', () => {
  const openSheet = async () => {
    await mount();
    fireEvent.click((await screen.findAllByText('Open'))[0]);
    await screen.findByText(/You will be working as their administrator/);
  };

  it('is offered only to somebody allowed to', async () => {
    granted = [];
    await mount();
    await screen.findByText('Decor Bucket');
    expect(screen.queryByText('Open')).not.toBeInTheDocument();
  });

  it('says what it means before it does it', async () => {
    await openSheet();
    expect(screen.getByText(/recorded under your name, not/)).toBeInTheDocument();
  });

  it('will not go in on a word', async () => {
    await openSheet();
    // The shop reads this sentence in their own history months later.
    expect(screen.getByRole('button', { name: 'Open their workspace' })).toBeDisabled();
  });

  it('goes in with a reason', async () => {
    await openSheet();
    fireEvent.change(field('Why are you going in?'), {
      target: { value: 'Their board is not loading' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open their workspace' }));
    });

    expect(openWorkspace).toHaveBeenCalledWith('t1', 'Their board is not loading');
  });
});


/**
 * Is anybody using it, and is it working for them?
 *
 * A workspace full of orders that nobody has opened for three weeks is a
 * different problem from a quiet one.
 */
describe('how a workspace is doing', () => {
  const withHealth = (health: Record<string, unknown> | undefined) => [
    { ...TENANT, health },
  ];

  const daysAgo = (days: number) =>
    new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  it('says when it was last used, and how much', async () => {
    await mount(withHealth({ lastSeenAt: daysAgo(0), writes: 42, failures: 0, clientErrors: 0 }));
    expect(await screen.findByText('Active today · 42 changes')).toBeInTheDocument();
  });

  it('counts the days since, rather than showing a timestamp', async () => {
    await mount(withHealth({ lastSeenAt: daysAgo(5), writes: 3, failures: 0, clientErrors: 0 }));
    expect(await screen.findByText('Last used 5 days ago')).toBeInTheDocument();
  });

  it('says plainly when nobody has touched it', async () => {
    await mount(withHealth({ lastSeenAt: null, writes: 0, failures: 0, clientErrors: 0 }));
    expect(await screen.findByText('Not used in a fortnight')).toBeInTheDocument();
  });

  it('surfaces what broke for them', async () => {
    await mount(withHealth({ lastSeenAt: daysAgo(1), writes: 8, failures: 3, clientErrors: 1 }));
    expect(await screen.findByText('3 failed calls')).toBeInTheDocument();
    expect(screen.getByText('1 app error')).toBeInTheDocument();
  });

  it('says nothing about failures where there were none', async () => {
    await mount(withHealth({ lastSeenAt: daysAgo(1), writes: 8, failures: 0, clientErrors: 0 }));
    await screen.findByText('Last used yesterday');
    expect(screen.queryByText(/failed/)).not.toBeInTheDocument();
  });

  it('copes with a workspace the API said nothing about', async () => {
    await mount(withHealth(undefined));
    expect(await screen.findByText('Not used in a fortnight')).toBeInTheDocument();
  });
});
