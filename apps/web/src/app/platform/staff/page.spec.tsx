import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import StaffPage from './page';

const apiMock = {
  platformRoles: jest.fn(),
  platformStaff: jest.fn(),
  savePlatformRole: jest.fn(),
  createPlatformRole: jest.fn(),
  deletePlatformRole: jest.fn(),
  savePlatformStaff: jest.fn(),
  createPlatformStaff: jest.fn(),
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

let permissions: string[] = [];
jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ can: (p: string) => permissions.includes(p), user: { id: 'me' } }),
}));

const OWNER = {
  id: 'r1',
  key: 'OWNER',
  name: 'Owner',
  blurb: 'Everything',
  permissions: ['platform.tenant.view', 'platform.staff.manage'],
  isSystem: true,
  people: 1,
};
const SUPPORT = {
  id: 'r2',
  key: 'SUPPORT',
  name: 'Support',
  blurb: 'Can open a workspace to help',
  permissions: ['platform.tenant.view'],
  isSystem: false,
  people: 0,
};

const ME = { id: 'me', email: 'nakul@firstleap.in', name: 'Nakul', role: 'OWNER', isActive: true };
const DEV = { id: 'u2', email: 'dev@firstleap.in', name: 'Dev', role: 'SUPPORT', isActive: true };

beforeEach(() => {
  jest.clearAllMocks();
  permissions = ['platform.staff.view', 'platform.staff.manage'];
  apiMock.platformRoles.mockResolvedValue([OWNER, SUPPORT]);
  apiMock.platformStaff.mockResolvedValue([ME, DEV]);
  apiMock.savePlatformRole.mockResolvedValue(OWNER);
  apiMock.createPlatformRole.mockResolvedValue(SUPPORT);
  apiMock.deletePlatformRole.mockResolvedValue({ key: 'SUPPORT' });
  apiMock.savePlatformStaff.mockResolvedValue(DEV);
  apiMock.createPlatformStaff.mockResolvedValue(DEV);
});

const mount = async () => {
  render(<StaffPage />);
  await screen.findByText('Owner');
};

it('lists our roles and who is on each', async () => {
  await mount();

  expect(screen.getByText(/Everything · 1 person/)).toBeInTheDocument();
  expect(screen.getByText(/dev@firstleap.in · Support/)).toBeInTheDocument();
});

// So nobody strips their own powers by mistaking themselves for a colleague.
it('marks which one is you', async () => {
  await mount();

  expect(screen.getByText('you')).toBeInTheDocument();
});

it('edits a role on the platform tree, not the shop’s', async () => {
  await mount();
  fireEvent.click(screen.getByText('Owner'));

  expect(await screen.findByText('What we charge')).toBeInTheDocument();
  expect(screen.queryByText('Buying and stock')).not.toBeInTheDocument();
});

it('saves what was ticked', async () => {
  await mount();
  fireEvent.click(screen.getByText('Owner'));
  fireEvent.click(await screen.findByText('Provision workspaces'));
  fireEvent.click(screen.getByText('Save'));

  await waitFor(() =>
    expect(apiMock.savePlatformRole).toHaveBeenCalledWith('OWNER', {
      name: 'Owner',
      permissions: ['platform.tenant.view', 'platform.staff.manage', 'platform.tenant.create'],
    }),
  );
});

// The seeded roles are what a session falls back to when a role row is gone.
it('offers to remove a role we wrote, but never a seeded one', async () => {
  await mount();
  fireEvent.click(screen.getByText('Support'));
  expect(await screen.findByText('Remove this role')).toBeInTheDocument();

  fireEvent.click(screen.getByText('Owner'));
  await waitFor(() => expect(screen.queryByText('Remove this role')).not.toBeInTheDocument());
});

it('puts a colleague on a different role', async () => {
  await mount();
  fireEvent.click(screen.getByText(/dev@firstleap.in/));
  const options = await screen.findAllByText('Owner');
  fireEvent.click(options[options.length - 1]);

  await waitFor(() =>
    expect(apiMock.savePlatformStaff).toHaveBeenCalledWith('u2', { role: 'OWNER' }),
  );
});

it('switches a colleague off', async () => {
  await mount();
  fireEvent.click(screen.getByText(/dev@firstleap.in/));
  fireEvent.click(await screen.findByText('Switch this person off'));

  await waitFor(() =>
    expect(apiMock.savePlatformStaff).toHaveBeenCalledWith('u2', { isActive: false }),
  );
});

it('adds a colleague', async () => {
  await mount();
  fireEvent.click(screen.getByText('Invite'));

  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Asha' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'asha@firstleap.in' } });
  const options = await screen.findAllByText('Support');
  fireEvent.click(options[options.length - 1]);
  fireEvent.change(document.querySelector('input[type="password"]')!, {
    target: { value: 'first-one-please' },
  });
  fireEvent.click(screen.getByText('Add them'));

  await waitFor(() =>
    expect(apiMock.createPlatformStaff).toHaveBeenCalledWith({
      name: 'Asha',
      email: 'asha@firstleap.in',
      role: 'SUPPORT',
      password: 'first-one-please',
    }),
  );
});

// The API refuses a lock-out whatever the browser allows, and the reason has
// to reach the person who tried.
it('shows what the API refused, rather than failing quietly', async () => {
  apiMock.savePlatformRole.mockRejectedValue(
    new Error('That would leave nobody able to manage staff'),
  );
  await mount();
  fireEvent.click(screen.getByText('Owner'));
  fireEvent.click(await screen.findByText('Save'));

  expect(await screen.findByText(/nobody able to manage staff/)).toBeInTheDocument();
});

it('offers nothing but looking to somebody who may only look', async () => {
  permissions = ['platform.staff.view'];
  await mount();

  expect(screen.queryByText('Invite')).not.toBeInTheDocument();
  expect(screen.queryByText('New role')).not.toBeInTheDocument();
});
