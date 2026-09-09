import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { TenantDetailScreen } from './TenantDetailScreen';

const mockDetail = jest.fn();
const mockTiers = jest.fn();
const mockPrices = jest.fn();
const mockUpdate = jest.fn();

jest.mock('../../api/client', () => ({
  api: {
    tenantDetail: (...a: unknown[]) => mockDetail(...a),
    platformTiers: () => mockTiers(),
    platformModulePrices: () => mockPrices(),
    updateTenant: (...a: unknown[]) => mockUpdate(...a),
  },
}));

let mockPermissions: string[] = [];
jest.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({ can: (p: string) => mockPermissions.includes(p) }),
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
  users: [
    { id: 'u1', code: 'ADMIN', name: 'Nakul', isActive: true, roleRef: { name: 'Owner' } },
  ],
  roles: [
    { id: 'r1', name: 'Owner', permissions: ['order.view'], isSystem: true, _count: { users: 1 } },
  ],
};

const TIERS = [
  { key: 'shop', label: 'Shop', monthlyPrice: 8000, includedModules: ['orders', 'clients', 'leads', 'quotes', 'finance'] },
  { key: 'works', label: 'Works', monthlyPrice: 15000, includedModules: ['orders', 'clients'] },
];

const navigation = { goBack: jest.fn(), navigate: jest.fn() };
const route = { params: { id: 't1' } };

beforeEach(() => {
  jest.clearAllMocks();
  mockPermissions = ['platform.tenant.view', 'platform.tenant.manage'];
  mockDetail.mockResolvedValue(WORKSPACE);
  mockTiers.mockResolvedValue(TIERS);
  mockPrices.mockResolvedValue([{ moduleKey: 'hr', monthlyPrice: 1500 }]);
  mockUpdate.mockResolvedValue(WORKSPACE);
});

const mount = async () => {
  await render(<TenantDetailScreen navigation={navigation as never} route={route as never} />);
  await waitFor(() => expect(mockDetail).toHaveBeenCalledWith('t1'));
};

// Shop 8,000 plus People 1,500. The tier and the add-on, added the same way
// the invoice will add them.
it('says what the workspace is billed, tier plus add-ons', async () => {
  await mount();

  expect(await screen.findByText('₹9,500')).toBeTruthy();
});

it('shows who is in it and how it has been going', async () => {
  await mount();

  expect(await screen.findByText('3 people')).toBeTruthy();
  expect(screen.getByText('131')).toBeTruthy();
});

it('moves the workspace to another tier', async () => {
  await mount();
  await fireEvent.press(await screen.findByText('Works · ₹15,000'));

  await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('t1', { plan: 'works' }));
});

it('grants a module on top of the tier', async () => {
  await mount();
  await fireEvent.press(await screen.findByTestId('module-purchasing'));

  await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
  expect(mockUpdate.mock.calls[0][1].modules).toEqual(['hr', 'purchasing']);
});

it('takes back an add-on granted on top of the tier', async () => {
  await mount();
  await fireEvent.press(await screen.findByTestId('module-hr'));

  await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('t1', { modules: [] }));
});

/*
 * A module inside the tier is not this workspace's to switch off — that is a
 * decision about everybody on that tier, and it belongs on the tier. The core
 * is not anybody's to switch off at all.
 */
it('does not offer to take away a module the tier includes, or the core', async () => {
  await mount();
  await fireEvent.press(await screen.findByTestId('module-finance'));
  await fireEvent.press(await screen.findByTestId('module-orders'));

  expect(mockUpdate).not.toHaveBeenCalled();
});

it('shows their people and roles without offering to change them', async () => {
  await mount();

  expect(await screen.findByText('ADMIN · Owner')).toBeTruthy();
  expect(screen.getByText('1 permissions · 1 person')).toBeTruthy();
});

it('offers no change at all to somebody who may only look', async () => {
  mockPermissions = ['platform.tenant.view'];
  await mount();
  await fireEvent.press(await screen.findByText('Works · ₹15,000'));

  expect(mockUpdate).not.toHaveBeenCalled();
});


describe('whose workspace it is', () => {
  it('marks one as ours', async () => {
    await mount();
    await fireEvent.press(await screen.findByText('Ours'));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('t1', { isInternal: true }));
  });

  it('says what ours would be worth, and that nobody pays it', async () => {
    mockDetail.mockResolvedValue({ ...WORKSPACE, isInternal: true });
    await mount();

    expect(await screen.findByText(/billed to nobody/)).toBeTruthy();
    expect(screen.getByText('₹9,500')).toBeTruthy();
  });
});
