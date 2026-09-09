import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { PlatformPlansScreen } from './PlatformPlansScreen';

const mockOverview = jest.fn();
const mockSetTier = jest.fn();
const mockSetModule = jest.fn();
const mockCreateTier = jest.fn();
const mockDeleteTier = jest.fn();
const mockTierEffect = jest.fn();

jest.mock('../../api/client', () => ({
  api: {
    platformOverview: () => mockOverview(),
    setTierPrice: (...a: unknown[]) => mockSetTier(...a),
    setModulePrice: (...a: unknown[]) => mockSetModule(...a),
    createTier: (...a: unknown[]) => mockCreateTier(...a),
    deleteTier: (...a: unknown[]) => mockDeleteTier(...a),
    tierEffect: (...a: unknown[]) => mockTierEffect(...a),
  },
}));

let mockPermissions: string[] = [];
jest.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({ can: (p: string) => mockPermissions.includes(p) }),
}));

const overview = () => ({
  workspaces: [
    {
      id: 't1',
      name: 'Decor Bucket',
      tier: 'shop',
      status: 'ACTIVE',
      bill: { monthlyTotal: 8000, lines: [{ kind: 'tier', label: 'Shop', amount: 8000 }] },
    },
  ],
  tiers: [
    {
      key: 'shop',
      label: 'Shop',
      blurb: 'Punching, and the money on it',
      monthlyPrice: 8000,
      includedModules: ['orders', 'clients', 'leads', 'quotes', 'finance'],
      planModules: ['orders', 'clients', 'leads', 'quotes', 'finance'],
    },
    {
      key: 'studio',
      label: 'Studio',
      blurb: 'One we wrote ourselves',
      monthlyPrice: 11000,
      includedModules: ['orders', 'clients'],
      planModules: [],
    },
  ],
  modulePrices: [
    { moduleKey: 'hr', label: 'People', monthlyPrice: 2500, isPriced: true, comingSoon: false },
  ],
  totals: { monthlyRecurring: 8000, paying: 1 },
});

const navigation = { goBack: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockPermissions = ['platform.tenant.view', 'platform.pricing.manage'];
  mockOverview.mockResolvedValue(overview());
  mockSetTier.mockResolvedValue({});
  mockSetModule.mockResolvedValue({});
  mockCreateTier.mockResolvedValue({ key: 'studio-plus' });
  mockDeleteTier.mockResolvedValue({ key: 'studio' });
  mockTierEffect.mockResolvedValue({ gaining: [], losing: [], workspacesOnTier: 1 });
});

const mount = async () => {
  await render(<PlatformPlansScreen navigation={navigation as never} />);
  await waitFor(() => expect(mockOverview).toHaveBeenCalled());
};

it('shows every tier with what it costs', async () => {
  await mount();

  expect(await screen.findByText('Shop')).toBeTruthy();
  expect(screen.getByText('Studio')).toBeTruthy();
});

/*
 * The ticked state and the price boxes are filled in by an effect after the
 * first render. Both fall back to what the tier already holds, so a tap in
 * between saves what is there rather than stripping it to the core.
 */
it('saves what a tier already holds when nothing has been touched', async () => {
  await mount();
  await fireEvent.press(screen.getAllByText('Save')[0]);

  await waitFor(() => expect(mockSetTier).toHaveBeenCalled());
  expect(mockSetTier.mock.calls[0][1]).toMatchObject({ monthlyPrice: 8000 });
  expect(mockSetTier.mock.calls[0][1].includedModules).toContain('finance');
});

it('saves a price without asking anybody anything', async () => {
  await mount();
  await fireEvent.press(screen.getAllByText('Save')[0]);

  await waitFor(() => expect(mockSetTier).toHaveBeenCalled());
  // A price reaches nobody's product, so there is nothing to warn about.
  expect(mockTierEffect).not.toHaveBeenCalled();
});

describe('taking a module out of a tier', () => {
  const removeFinance = async () => {
    await fireEvent.press(screen.getAllByText('Finances')[0]);
    await fireEvent.press(screen.getAllByText('Save')[0]);
  };

  it('asks what it would do before doing it', async () => {
    mockTierEffect.mockResolvedValue({
      gaining: [],
      losing: [
        { module: 'finance', label: 'Finances', workspaces: [{ id: 't1', name: 'Decor Bucket' }] },
      ],
      workspacesOnTier: 1,
    });
    await mount();
    await screen.findByText('Shop');
    await removeFinance();

    expect(await screen.findByText('This takes something away')).toBeTruthy();
    expect(screen.getByText(/Decor Bucket loses it/)).toBeTruthy();
    expect(mockSetTier).not.toHaveBeenCalled();
  });

  it('saves it once somebody has said so', async () => {
    mockTierEffect.mockResolvedValue({
      gaining: [],
      losing: [
        { module: 'finance', label: 'Finances', workspaces: [{ id: 't1', name: 'Decor Bucket' }] },
      ],
      workspacesOnTier: 1,
    });
    await mount();
    await screen.findByText('Shop');
    await removeFinance();
    await fireEvent.press(await screen.findByText('Save it anyway'));

    await waitFor(() => expect(mockSetTier).toHaveBeenCalled());
    expect(mockSetTier.mock.calls[0][1].includedModules).not.toContain('finance');
  });

  // A warning that cries wolf is one nobody reads on the day it is right.
  it('does not stop to warn when nobody would actually lose it', async () => {
    mockTierEffect.mockResolvedValue({
      gaining: [],
      losing: [{ module: 'finance', label: 'Finances', workspaces: [] }],
      workspacesOnTier: 1,
    });
    await mount();
    await screen.findByText('Shop');
    await removeFinance();

    await waitFor(() => expect(mockSetTier).toHaveBeenCalled());
    expect(screen.queryByText('This takes something away')).toBeNull();
  });
});

describe('a tier we write ourselves', () => {
  it('makes one, starting at the core', async () => {
    await mount();
    await fireEvent.press(await screen.findByText('New tier'));
    await fireEvent.changeText(await screen.findByPlaceholderText('Studio'), 'Studio Plus');
    await fireEvent.press(screen.getByText('Make it'));

    await waitFor(() => expect(mockCreateTier).toHaveBeenCalled());
    expect(mockCreateTier.mock.calls[0][0]).toMatchObject({
      key: 'studio-plus',
      label: 'Studio Plus',
    });
    expect(mockCreateTier.mock.calls[0][0].includedModules).toContain('orders');
  });

  it('removes one nobody is on', async () => {
    await mount();
    await fireEvent.press(await screen.findByText('Remove this tier'));

    await waitFor(() => expect(mockDeleteTier).toHaveBeenCalledWith('studio'));
  });

  /*
   * The seeded three are what a workspace with an unrecognised plan key falls
   * back to. Removing one turns a bad key into no product rather than a
   * default one — the API refuses it either way.
   */
  it('offers no way to remove a seeded tier', async () => {
    await mount();
    await screen.findByText('Shop');

    expect(screen.getAllByText('Remove this tier')).toHaveLength(1);
  });

  it('says why the API refused, rather than failing quietly', async () => {
    mockDeleteTier.mockRejectedValue(new Error('2 workspaces are on this tier. Move them first'));
    await mount();
    await fireEvent.press(await screen.findByText('Remove this tier'));

    expect(await screen.findByText(/2 workspaces are on this tier/)).toBeTruthy();
  });
});

it('offers nothing but reading to somebody who may not price', async () => {
  mockPermissions = ['platform.tenant.view'];
  await mount();
  await screen.findByText('Shop');

  expect(screen.queryByText('New tier')).toBeNull();
  expect(screen.queryByText('Remove this tier')).toBeNull();
});
