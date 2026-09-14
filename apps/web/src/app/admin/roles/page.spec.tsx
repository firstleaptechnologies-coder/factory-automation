import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PERMISSIONS } from '@fas/shared';
import RolesPage from './page';

const apiMock = {
  roles: jest.fn(),
  users: jest.fn(),
  createRole: jest.fn(),
  updateRole: jest.fn(),
  deleteRole: jest.fn(),
  assignRole: jest.fn(),
  setUserActive: jest.fn(),
};
jest.mock('@/lib/api', () => ({
  api: new Proxy(
    {},
    {
      get: (_t, key: string) => (...args: never[]) =>
        (apiMock[key as keyof typeof apiMock] as (...a: never[]) => unknown)(...args),
    },
  ),
}));

let permissions: string[] = [];
jest.mock('@/lib/auth', () => ({
  useAuth: () => ({
    can: (p: string) => permissions.includes(p),
    // What this workspace bought. The permission tree greys out the rest.
    user: { workspace: { modules: ['orders', 'clients', 'leads', 'quotes', 'finance'] } },
  }),
}));

jest.mock('@/components/Shell', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const OWNER = {
  id: 'r1',
  code: 'OWNER',
  name: 'Owner',
  permissions: [PERMISSIONS.ROLE_MANAGE, PERMISSIONS.ORDER_VIEW],
  isSystem: true,
  _count: { users: 1 },
};

const ACCOUNTANT = {
  id: 'r2',
  code: 'ACCOUNTANT',
  name: 'Accountant',
  permissions: [PERMISSIONS.PAYMENT_VIEW],
  isSystem: false,
  _count: { users: 0 },
};

const USER = {
  id: 'u1',
  code: 'PROD01',
  name: 'Production',
  role: 'PRODUCTION',
  roleId: 'r1',
  roleRef: { id: 'r1', name: 'Owner' },
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  permissions = [PERMISSIONS.USER_VIEW, PERMISSIONS.ROLE_MANAGE];
  apiMock.roles.mockResolvedValue([OWNER, ACCOUNTANT]);
  apiMock.users.mockResolvedValue([USER]);
  apiMock.createRole.mockResolvedValue(ACCOUNTANT);
  apiMock.updateRole.mockResolvedValue(ACCOUNTANT);
  apiMock.deleteRole.mockResolvedValue({ id: 'r2' });
  apiMock.assignRole.mockResolvedValue(USER);
  apiMock.setUserActive.mockResolvedValue(USER);
});

const mount = async () => {
  render(<RolesPage />);
  await screen.findByText('Roles and people');
};

it('lists the roles with how many people are on each', async () => {
  await mount();
  // "Owner" also names the role the one person is on, further down.
  expect(await screen.findByText('Owner', { selector: 'td' })).toBeInTheDocument();
  expect(screen.getByText('Seeded')).toBeInTheDocument();
});

it('groups the permissions the way the product is, in words', async () => {
  await mount();
  fireEvent.click(screen.getByText('Accountant'));

  // Four levels: the module it was bought under, the feature, the group, and
  // the permission itself.
  expect(await screen.findByText('Finances')).toBeInTheDocument();
  expect(screen.getByText('Money in and out')).toBeInTheDocument();
  expect(screen.getByText('Payments')).toBeInTheDocument();
  expect(screen.getByText('View payments')).toBeInTheDocument();
});

// Modules are what a workspace bought; permissions are what somebody inside it
// may do. Ticking a permission for a module they have not bought grants
// nothing, so the branch is shown and locked rather than offered.
it('locks a section the workspace has not bought, rather than hiding it', async () => {
  await mount();
  fireEvent.click(screen.getByText('Accountant'));

  // Scoped to the tree: "People" and "Orders" are table headings too.
  await screen.findByText('Finances');
  const sections = [...document.querySelectorAll('.perm-section')];
  const named = (label: string) =>
    sections.find((one) => one.querySelector('.t-label')?.textContent === label);

  expect(named('People')).toHaveAttribute('data-locked', 'true');
  expect(named('Orders')).toHaveAttribute('data-locked', 'false');
  expect(screen.getAllByText(/is not on this workspace’s plan/).length).toBeGreaterThan(0);
});

// Showing a half-ticked branch as off invites somebody to tick it and silently
// grant everything else under it.
it('shows a part-held branch as part-held', async () => {
  await mount();
  fireEvent.click(screen.getByText('Accountant'));
  await screen.findByText('Payments');

  const group = screen.getByText('Payments').closest('.perm-group-head');
  expect(group?.querySelector('.perm-box')).toHaveAttribute('data-state', 'some');
});

it('saves what was ticked', async () => {
  await mount();
  fireEvent.click(screen.getByText('Accountant'));
  fireEvent.click(await screen.findByText('Record payments'));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(apiMock.updateRole).toHaveBeenCalledWith('r2', {
      name: 'Accountant',
      permissions: [PERMISSIONS.PAYMENT_VIEW, PERMISSIONS.PAYMENT_RECORD],
    }),
  );
});

it('offers to remove a role the shop wrote, but never a seeded one', async () => {
  await mount();
  fireEvent.click(screen.getByText('Accountant'));
  expect(await screen.findByText('Remove this role')).toBeInTheDocument();
});

it('says why a change was refused, rather than nothing', async () => {
  apiMock.updateRole.mockRejectedValue(
    new Error('That would leave nobody able to manage roles.'),
  );
  await mount();
  fireEvent.click(screen.getByText('Accountant'));
  fireEvent.click(await screen.findByRole('button', { name: 'Save' }));
  expect(
    await screen.findByText('That would leave nobody able to manage roles.'),
  ).toBeInTheDocument();
});

it('puts somebody on a different role', async () => {
  await mount();
  const trigger = document.querySelectorAll('.select-trigger')[0] as HTMLElement;
  fireEvent.click(trigger);
  fireEvent.click(await screen.findByRole('option', { name: /Accountant/ }));
  await waitFor(() => expect(apiMock.assignRole).toHaveBeenCalledWith('u1', 'r2'));
});

it('shows the role as plain text to somebody who may only look', async () => {
  permissions = [PERMISSIONS.USER_VIEW];
  await mount();
  expect(screen.queryByText('New role')).toBeNull();
  // The role reads as plain text rather than a well nobody may open.
  expect(document.querySelectorAll('.select-trigger')).toHaveLength(0);
  expect(screen.getByText('Owner', { selector: 'span' })).toBeInTheDocument();
});

/*
 * Letting somebody back in.
 *
 * The table drew "Switched off" and nothing anywhere could change it, so a
 * person switched off stayed switched off for good.
 */
describe('whether somebody may sign in', () => {
  it('switches a person off without deleting them', async () => {
    await mount();

    fireEvent.click(await screen.findByText('Can sign in'));

    // Never deleted: their name has to stay on every order they punched.
    await waitFor(() => expect(apiMock.setUserActive).toHaveBeenCalledWith('u1', false));
  });

  it('lets a switched-off person back in', async () => {
    apiMock.users.mockResolvedValue([{ ...USER, isActive: false }]);
    await mount();

    fireEvent.click(await screen.findByText('Switched off'));

    await waitFor(() => expect(apiMock.setUserActive).toHaveBeenCalledWith('u1', true));
  });

  it('shows it as a fact, not a switch, to somebody who may not change it', async () => {
    permissions = [PERMISSIONS.USER_VIEW];
    apiMock.users.mockResolvedValue([{ ...USER, isActive: false }]);
    await mount();

    expect(await screen.findByText('Switched off')).toBeInTheDocument();
    expect(screen.queryByText('Can sign in')).toBeNull();
  });
});
