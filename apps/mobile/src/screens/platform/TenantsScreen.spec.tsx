import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { PERMISSIONS } from '@decor/shared';
import { TenantsScreen } from './TenantsScreen';

const mockTenants = jest.fn();
const mockCreateTenant = jest.fn();
jest.mock('../../api/client', () => ({
  api: {
    tenants: () => mockTenants(),
    createTenant: (...a: unknown[]) => mockCreateTenant(...a),
  },
}));

const mockSignOut = jest.fn();
jest.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({
    signOut: mockSignOut,
    user: { name: 'Ops', isPlatform: true },
    can: (permission: string) => mockGranted.includes(permission),
    openWorkspace: (...a: unknown[]) => mockOpenWorkspace(...a),
  }),
}));

let mockGranted: string[] = [];
const mockOpenWorkspace = jest.fn();

const TENANT = {
  id: 't1',
  slug: 'decorbucket',
  name: 'Decor Bucket',
  status: 'ACTIVE',
  isolation: 'SHARED',
  plan: 'Gold',
  createdAt: '2026-01-01T10:00:00Z',
  hasDedicatedDatabase: false,
  counts: { users: 4, orders: 9, clients: 6 },
};

async function mount(rows: unknown[] = [TENANT]) {
  mockTenants.mockResolvedValue(rows);
  await render(<TenantsScreen navigation={{ goBack: jest.fn() }} />);
  await screen.findByText('Workspaces');
}

const openSheet = () => fireEvent.press(screen.getByText('New workspace'));
const submit = () => fireEvent.press(screen.getByText('Create workspace'));

async function fillForm() {
  await fireEvent.changeText(await screen.findByPlaceholderText('woodcraft'), ' WoodCraft ');
  await fireEvent.changeText(screen.getByPlaceholderText('Woodcraft Studio'), 'Woodcraft Studio');
  await fireEvent.changeText(screen.getByPlaceholderText('Ravi Kumar'), 'Ravi Kumar');
}

beforeEach(() => {
  mockGranted = [];
  mockOpenWorkspace.mockResolvedValue(undefined);
  jest.clearAllMocks();
  mockCreateTenant.mockResolvedValue({
    name: 'Woodcraft Studio',
    signIn: { workspace: 'woodcraft', code: 'ADMIN' },
  });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

it('says how many workspaces are on the platform', async () => {
  await mount();
  expect(screen.getByText('1 on the platform')).toBeTruthy();
});

it('shows each workspace, its slug, status and plan', async () => {
  await mount();
  expect(screen.getByText('Decor Bucket')).toBeTruthy();
  expect(screen.getByText(/decorbucket · since/)).toBeTruthy();
  expect(screen.getByText('ACTIVE')).toBeTruthy();
  expect(screen.getByText('Gold')).toBeTruthy();
});

it('says whether a workspace has its own database', async () => {
  await mount();
  expect(screen.getByText('shared')).toBeTruthy();
  await mount([{ ...TENANT, isolation: 'DEDICATED', hasDedicatedDatabase: true }]);
  expect(screen.getByText('own database')).toBeTruthy();
});

it('counts what is inside each workspace', async () => {
  await mount();
  expect(screen.getByText('4')).toBeTruthy();
  expect(screen.getByText('9')).toBeTruthy();
  expect(screen.getByText('6')).toBeTruthy();
});

it('says plainly when a workspace’s database cannot be reached', async () => {
  await mount([
    { ...TENANT, counts: { users: null, orders: null, clients: null, unreachable: true } },
  ]);
  // One tenant being down must not look like a tenant with no data.
  expect(screen.getByText('database unreachable')).toBeTruthy();
});

it('says when there are none', async () => {
  await mount([]);
  expect(screen.getByText('No workspaces yet')).toBeTruthy();
});

describe('creating one', () => {
  it('lower-cases the slug, since it is what people type to sign in', async () => {
    await mount();
    await openSheet();
    await fillForm();
    await fireEvent.changeText(screen.getByPlaceholderText('••••••••'), 'admin123');
    await submit();
    await waitFor(() => expect(mockCreateTenant).toHaveBeenCalled());
    expect(mockCreateTenant.mock.calls[0][0].slug).toBe('woodcraft');
  });

  it('starts on a shared database', async () => {
    await mount();
    await openSheet();
    await fillForm();
    await fireEvent.changeText(screen.getByPlaceholderText('••••••••'), 'admin123');
    await submit();
    await waitFor(() => expect(mockCreateTenant).toHaveBeenCalled());
    expect(mockCreateTenant.mock.calls[0][0]).toMatchObject({
      isolation: 'SHARED',
      databaseUrl: undefined,
    });
  });

  it('asks for a connection string only for its own database', async () => {
    await mount();
    await openSheet();
    expect(screen.queryByPlaceholderText('postgresql://…')).toBeNull();
    await fireEvent.press(screen.getByText('Own database'));
    expect(screen.getByPlaceholderText('postgresql://…')).toBeTruthy();
  });

  it('sends the connection string for a dedicated workspace', async () => {
    await mount();
    await openSheet();
    await fillForm();
    await fireEvent.press(screen.getByText('Own database'));
    await fireEvent.changeText(
      screen.getByPlaceholderText('postgresql://…'),
      ' postgresql://host/db ',
    );
    await fireEvent.changeText(screen.getByPlaceholderText('••••••••'), 'admin123');
    await submit();
    await waitFor(() => expect(mockCreateTenant).toHaveBeenCalled());
    expect(mockCreateTenant.mock.calls[0][0]).toMatchObject({
      isolation: 'DEDICATED',
      databaseUrl: 'postgresql://host/db',
    });
  });

  it('hands back the sign-in details, which nobody can look up later', async () => {
    await mount();
    await openSheet();
    await fillForm();
    await fireEvent.changeText(screen.getByPlaceholderText('••••••••'), 'admin123');
    await submit();
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe('Workspace ready');
    expect((Alert.alert as jest.Mock).mock.calls[0][1]).toMatch(/woodcraft.*ADMIN/);
  });

  it('shows the server’s refusal', async () => {
    mockCreateTenant.mockRejectedValue(new Error('Workspace "woodcraft" is taken'));
    await mount();
    await openSheet();
    await fillForm();
    await fireEvent.changeText(screen.getByPlaceholderText('••••••••'), 'admin123');
    await submit();
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe('Could not create');
  });
});

it('signs the platform admin out', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Sign out'));
  expect(mockSignOut).toHaveBeenCalled();
});


/**
 * Opening a workspace to help.
 *
 * The one platform power that reaches inside a shop's data, so the screen makes
 * it deliberate rather than convenient.
 */
describe('opening a workspace', () => {
  it('is offered only to somebody allowed to', async () => {
    await mount();
    expect(screen.queryByText('Open to help')).toBeNull();

    mockGranted = [PERMISSIONS.PLATFORM_IMPERSONATE];
    await mount();
    expect(screen.getAllByText('Open to help').length).toBeGreaterThan(0);
  });

  it('says what it means, and goes in with a reason', async () => {
    mockGranted = [PERMISSIONS.PLATFORM_IMPERSONATE];
    await mount();
    await fireEvent.press(screen.getAllByText('Open to help')[0]);

    expect(screen.getByText(/recorded under your name, not theirs/)).toBeTruthy();
    await fireEvent.changeText(
      screen.getByPlaceholderText('Their board is not loading and they are on the phone'),
      'Their board is not loading',
    );
    await fireEvent.press(screen.getByText('Open their workspace'));

    expect(mockOpenWorkspace).toHaveBeenCalledWith(expect.any(String), 'Their board is not loading');
  });
});
