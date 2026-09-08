import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PERMISSIONS } from '@decor/shared';
import RolesPage from './page';

const apiMock = {
  roles: jest.fn(),
  users: jest.fn(),
  createRole: jest.fn(),
  updateRole: jest.fn(),
  deleteRole: jest.fn(),
  assignRole: jest.fn(),
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
  useAuth: () => ({ can: (p: string) => permissions.includes(p) }),
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
  expect(await screen.findByText('Money')).toBeInTheDocument();
  expect(screen.getByText('View payments')).toBeInTheDocument();
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
