import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import WorkspacePage from './page';

const apiMock = {
  tenantDetail: jest.fn(),
  platformTiers: jest.fn(),
  platformModulePrices: jest.fn(),
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
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ id: 't1' }),
}));

let permissions: string[] = [];
jest.mock('@/lib/auth', () => ({
  useAuth: () => ({
    can: (p: string) => permissions.includes(p),
    openWorkspace: jest.fn(),
  }),
}));

const WORKSPACE = {
  id: 't1',
  slug: 'decorbucket',
  name: 'Decor Bucket',
  status: 'ACTIVE',
  isolation: 'SHARED',
  plan: 'shop',
  modules: ['hr'],
  hasDedicatedDatabase: false,
  effectiveModules: ['orders', 'clients', 'leads', 'quotes', 'finance', 'hr'],
  counts: { users: 3, orders: 6, clients: 3 },
  health: { lastSeenAt: '2026-09-09T00:00:00Z', writes: 131, failures: 0, clientErrors: 2 },
  users: [{ id: 'u1', code: 'ADMIN', name: 'Nakul', isActive: true, roleRef: { name: 'Owner' } }],
  roles: [
    { id: 'r1', name: 'Owner', permissions: ['order.view'], isSystem: true, _count: { users: 1 } },
  ],
};

const TIERS = [
  {
    key: 'shop',
    label: 'Shop',
    monthlyPrice: 8000,
    includedModules: ['orders', 'clients', 'leads', 'quotes', 'finance'],
  },
  { key: 'works', label: 'Works', monthlyPrice: 15000, includedModules: ['orders', 'clients'] },
];

beforeEach(() => {
  jest.clearAllMocks();
  permissions = ['platform.tenant.view', 'platform.tenant.manage'];
  apiMock.tenantDetail.mockResolvedValue(WORKSPACE);
  apiMock.platformTiers.mockResolvedValue(TIERS);
  apiMock.platformModulePrices.mockResolvedValue([{ moduleKey: 'hr', monthlyPrice: 1500 }]);
  apiMock.updateTenant.mockResolvedValue(WORKSPACE);
});

const mount = async () => {
  render(<WorkspacePage />);
  await screen.findByText('Decor Bucket');
};

// Shop 8,000 plus People 1,500, added the way the invoice will add them.
it('says what the workspace is billed, tier plus add-ons', async () => {
  await mount();

  expect(screen.getByText('₹9,500')).toBeInTheDocument();
  expect(screen.getByText(/Shop ₹8,000 \+ add-ons ₹1,500/)).toBeInTheDocument();
});

it('shows who is in it and how it has been going', async () => {
  await mount();

  expect(screen.getByText(/6 orders · 3 clients/)).toBeInTheDocument();
  expect(screen.getByText('131')).toBeInTheDocument();
});

it('moves the workspace to another tier', async () => {
  await mount();
  fireEvent.click(screen.getByText('Works · ₹15,000'));

  await waitFor(() => expect(apiMock.updateTenant).toHaveBeenCalledWith('t1', { plan: 'works' }));
});

it('grants a module on top of the tier', async () => {
  await mount();
  const purchasing = screen.getByTestId('module-purchasing');
  fireEvent.click(purchasing.querySelector('.chip')!);

  await waitFor(() => expect(apiMock.updateTenant).toHaveBeenCalled());
  expect(apiMock.updateTenant.mock.calls[0][1].modules).toEqual(['hr', 'purchasing']);
});

it('takes back an add-on granted on top of the tier', async () => {
  await mount();
  fireEvent.click(screen.getByTestId('module-hr').querySelector('.chip')!);

  await waitFor(() => expect(apiMock.updateTenant).toHaveBeenCalledWith('t1', { modules: [] }));
});

/*
 * A module inside the tier is not this workspace's to switch off — that is a
 * decision about everybody on that tier. The core is not anybody's to switch
 * off at all.
 */
it('does not offer to take away a module the tier includes, or the core', async () => {
  await mount();
  fireEvent.click(screen.getByTestId('module-finance').querySelector('.chip')!);
  fireEvent.click(screen.getByTestId('module-orders').querySelector('.chip')!);

  expect(apiMock.updateTenant).not.toHaveBeenCalled();
});

it('says which modules come with the tier and which are paid for on top', async () => {
  await mount();

  expect(screen.getByTestId('module-finance')).toHaveTextContent('in the tier');
  expect(screen.getByTestId('module-hr')).toHaveTextContent('add-on ₹1,500');
  expect(screen.getByTestId('module-orders')).toHaveTextContent('core');
});

it('shows their people and roles without offering to change them', async () => {
  await mount();

  expect(screen.getByText(/ADMIN · Owner/)).toBeInTheDocument();
  expect(screen.getByText(/1 permissions · 1 person/)).toBeInTheDocument();
});

it('offers no change at all to somebody who may only look', async () => {
  permissions = ['platform.tenant.view'];
  await mount();
  fireEvent.click(screen.getByText('Works · ₹15,000'));

  expect(apiMock.updateTenant).not.toHaveBeenCalled();
});

// Their connection string is never returned by the API; an unreachable
// database must say so rather than render an empty shop.
it('says so when their database could not be reached', async () => {
  apiMock.tenantDetail.mockResolvedValue({ ...WORKSPACE, unreachable: true, users: [], roles: [] });
  await mount();

  expect(screen.getByText(/database could not be reached/)).toBeInTheDocument();
});


describe('whose workspace it is', () => {
  it('marks one as ours', async () => {
    await mount();
    fireEvent.click(screen.getByText('Ours'));

    await waitFor(() =>
      expect(apiMock.updateTenant).toHaveBeenCalledWith('t1', { isInternal: true }),
    );
  });

  it('hands one back to a client', async () => {
    apiMock.tenantDetail.mockResolvedValue({ ...WORKSPACE, isInternal: true });
    await mount();
    fireEvent.click(screen.getByText("A client's"));

    await waitFor(() =>
      expect(apiMock.updateTenant).toHaveBeenCalledWith('t1', { isInternal: false }),
    );
  });

  // The figure stays — "what would we charge for this" is a real question —
  // but it must not read as money coming in.
  it('says what ours would be worth, and that nobody pays it', async () => {
    apiMock.tenantDetail.mockResolvedValue({ ...WORKSPACE, isInternal: true });
    await mount();

    expect(screen.getByText('₹9,500')).toBeInTheDocument();
    expect(screen.getByText(/billed to nobody/)).toBeInTheDocument();
  });
});
