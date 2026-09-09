import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PlansAndPricesPage from './page';

const apiMock = {
  platformOverview: jest.fn(),
  setTierPrice: jest.fn(),
  setModulePrice: jest.fn(),
  createTier: jest.fn(),
  deleteTier: jest.fn(),
  tierEffect: jest.fn(),
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

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

let permissions: string[] = [];
jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ can: (p: string) => permissions.includes(p) }),
}));

const overview = (over: Record<string, unknown> = {}) => ({
  workspaces: [
    { id: 't1', name: 'Decor Bucket', plan: 'shop', billedAddOns: [], status: 'ACTIVE' },
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
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  permissions = ['platform.tenant.view', 'platform.pricing.manage'];
  apiMock.platformOverview.mockResolvedValue(overview());
  apiMock.setTierPrice.mockResolvedValue({});
  apiMock.setModulePrice.mockResolvedValue({});
  apiMock.createTier.mockResolvedValue({ key: 'studio' });
  apiMock.deleteTier.mockResolvedValue({ key: 'studio' });
  apiMock.tierEffect.mockResolvedValue({ gaining: [], losing: [], workspacesOnTier: 1 });
});

const mount = async () => {
  render(<PlansAndPricesPage />);
  await screen.findByText('Shop');
};

/*
 * The ticked state and the price boxes are filled in by an effect after the
 * first render. Both fall back to what the tier already holds, so a click in
 * between saves what is there rather than zeroing it — which is what these two
 * assert.
 */
it('shows a tier’s real price before the form has hydrated', async () => {
  render(<PlansAndPricesPage />);

  expect(await screen.findByDisplayValue('8000')).toBeInTheDocument();
});

it('saves what a tier already holds when nothing has been touched', async () => {
  render(<PlansAndPricesPage />);
  await screen.findByText('Shop');
  fireEvent.click(screen.getAllByText('Save')[0]);

  await waitFor(() => expect(apiMock.setTierPrice).toHaveBeenCalled());
  expect(apiMock.setTierPrice.mock.calls[0][1]).toMatchObject({ monthlyPrice: 8000 });
  expect(apiMock.setTierPrice.mock.calls[0][1].includedModules).toContain('finance');
});

it('shows every tier with what it costs', async () => {
  await mount();

  expect(screen.getByDisplayValue('8000')).toBeInTheDocument();
  expect(screen.getByText('Studio')).toBeInTheDocument();
});

it('saves a price without asking anybody anything', async () => {
  await mount();
  fireEvent.click(screen.getAllByText('Save')[0]);

  await waitFor(() => expect(apiMock.setTierPrice).toHaveBeenCalled());
  // A price reaches nobody's product, so there is nothing to warn about.
  expect(apiMock.tierEffect).not.toHaveBeenCalled();
});

// A tier without Orders and Clients is not a cheaper tier, it is a broken one.
it('will not let the core be taken out of a tier', async () => {
  await mount();
  fireEvent.click(screen.getAllByText('Orders (core)')[0]);
  fireEvent.click(screen.getAllByText('Save')[0]);

  await waitFor(() => expect(apiMock.setTierPrice).toHaveBeenCalled());
  expect(apiMock.setTierPrice.mock.calls[0][1].includedModules).toContain('orders');
});

it('adds a module to a tier', async () => {
  await mount();
  fireEvent.click(screen.getAllByText('People')[0]);
  fireEvent.click(screen.getAllByText('Save')[0]);

  await waitFor(() => expect(apiMock.setTierPrice).toHaveBeenCalled());
  expect(apiMock.setTierPrice.mock.calls[0][1].includedModules).toContain('hr');
});

/*
 * The one control on this screen that cannot be undone by ticking the box back
 * on: the shop has already lost it. So the server is asked who, and the answer
 * goes in front of somebody first.
 */
describe('taking a module out of a tier', () => {
  const removeFinance = () => {
    fireEvent.click(screen.getAllByText('Finances')[0]);
    fireEvent.click(screen.getAllByText('Save')[0]);
  };

  it('asks what it would do before doing it', async () => {
    apiMock.tierEffect.mockResolvedValue({
      gaining: [],
      losing: [{ module: 'finance', label: 'Finances', workspaces: [{ id: 't1', name: 'Decor Bucket' }] }],
      workspacesOnTier: 1,
    });
    await mount();
    removeFinance();

    await waitFor(() => expect(apiMock.tierEffect).toHaveBeenCalled());
    expect(await screen.findByText('This takes something away')).toBeInTheDocument();
    expect(screen.getByText(/Decor Bucket loses it/)).toBeInTheDocument();
    expect(apiMock.setTierPrice).not.toHaveBeenCalled();
  });

  it('saves it once somebody has said so', async () => {
    apiMock.tierEffect.mockResolvedValue({
      gaining: [],
      losing: [{ module: 'finance', label: 'Finances', workspaces: [{ id: 't1', name: 'Decor Bucket' }] }],
      workspacesOnTier: 1,
    });
    await mount();
    removeFinance();
    fireEvent.click(await screen.findByText('Save it anyway'));

    await waitFor(() => expect(apiMock.setTierPrice).toHaveBeenCalled());
    expect(apiMock.setTierPrice.mock.calls[0][1].includedModules).not.toContain('finance');
  });

  it('leaves it alone when somebody thinks better of it', async () => {
    apiMock.tierEffect.mockResolvedValue({
      gaining: [],
      losing: [{ module: 'finance', label: 'Finances', workspaces: [{ id: 't1', name: 'Decor Bucket' }] }],
      workspacesOnTier: 1,
    });
    await mount();
    removeFinance();
    fireEvent.click(await screen.findByText('Leave it alone'));

    expect(apiMock.setTierPrice).not.toHaveBeenCalled();
  });

  // A warning that cries wolf is one nobody reads on the day it is right.
  it('does not stop to warn when nobody would actually lose it', async () => {
    apiMock.tierEffect.mockResolvedValue({
      gaining: [],
      losing: [{ module: 'finance', label: 'Finances', workspaces: [] }],
      workspacesOnTier: 1,
    });
    await mount();
    removeFinance();

    await waitFor(() => expect(apiMock.setTierPrice).toHaveBeenCalled());
    expect(screen.queryByText('This takes something away')).not.toBeInTheDocument();
  });
});

describe('a tier we write ourselves', () => {
  it('makes one, starting at the core', async () => {
    await mount();
    fireEvent.click(screen.getByText('New tier'));
    fireEvent.change(screen.getByLabelText('Called'), { target: { value: 'Studio Plus' } });
    fireEvent.click(screen.getByText('Make it'));

    await waitFor(() => expect(apiMock.createTier).toHaveBeenCalled());
    expect(apiMock.createTier.mock.calls[0][0]).toMatchObject({
      key: 'studio-plus',
      label: 'Studio Plus',
    });
    expect(apiMock.createTier.mock.calls[0][0].includedModules).toContain('orders');
  });

  it('offers a key rather than demanding one', async () => {
    await mount();
    fireEvent.click(screen.getByText('New tier'));
    fireEvent.change(screen.getByLabelText('Called'), { target: { value: 'Big Shop' } });

    expect(screen.getByDisplayValue('big-shop')).toBeInTheDocument();
  });

  it('removes one nobody is on', async () => {
    await mount();
    fireEvent.click(screen.getByText('Remove'));

    await waitFor(() => expect(apiMock.deleteTier).toHaveBeenCalledWith('studio'));
  });

  /*
   * The seeded three are what a workspace with an unrecognised plan key falls
   * back to. Removing one turns a bad key into no product rather than a
   * default one — the API refuses it either way.
   */
  it('offers no way to remove a seeded tier', async () => {
    await mount();

    expect(screen.getAllByText('Remove')).toHaveLength(1);
  });

  it('says why the API refused, rather than failing quietly', async () => {
    apiMock.deleteTier.mockRejectedValue(new Error('2 workspaces are on this tier. Move them first'));
    await mount();
    fireEvent.click(screen.getByText('Remove'));

    expect(await screen.findByText(/2 workspaces are on this tier/)).toBeInTheDocument();
  });
});

it('offers nothing but reading to somebody who may not price', async () => {
  permissions = ['platform.tenant.view'];
  await mount();

  expect(screen.queryByText('New tier')).not.toBeInTheDocument();
  expect(screen.queryByText('Remove')).not.toBeInTheDocument();
});
