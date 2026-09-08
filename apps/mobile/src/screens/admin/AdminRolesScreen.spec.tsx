import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { PERMISSIONS } from '@decor/shared';
import { AdminRolesScreen } from './AdminRolesScreen';

const mockRoles = jest.fn();
const mockUsers = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockAssign = jest.fn();
jest.mock('../../api/client', () => ({
  api: {
    roles: () => mockRoles(),
    users: () => mockUsers(),
    createRole: (...a: unknown[]) => mockCreate(...a),
    updateRole: (...a: unknown[]) => mockUpdate(...a),
    deleteRole: (...a: unknown[]) => mockDelete(...a),
    assignRole: (...a: unknown[]) => mockAssign(...a),
  },
}));

let mockPermissions: string[] = [];
jest.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({ can: (p: string) => mockPermissions.includes(p) }),
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

const navigation = { goBack: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockPermissions = [PERMISSIONS.USER_VIEW, PERMISSIONS.ROLE_MANAGE];
  mockRoles.mockResolvedValue([OWNER, ACCOUNTANT]);
  mockUsers.mockResolvedValue([USER]);
  mockCreate.mockResolvedValue(ACCOUNTANT);
  mockUpdate.mockResolvedValue(ACCOUNTANT);
  mockDelete.mockResolvedValue({ id: 'r2' });
  mockAssign.mockResolvedValue(USER);
});

const mount = async () => {
  await render(<AdminRolesScreen navigation={navigation as never} />);
  await waitFor(() => expect(mockRoles).toHaveBeenCalled());
};

it('lists the roles with how many people are on each', async () => {
  await mount();
  expect(await screen.findByText('Owner')).toBeTruthy();
  expect(screen.getByText('2 permissions · 1 person')).toBeTruthy();
  expect(screen.getByText('Seeded')).toBeTruthy();
});

it('says which role each person is actually on', async () => {
  await mount();
  // The coarse label would say "PRODUCTION" beside somebody whose role has
  // been rewritten to something else entirely.
  expect(await screen.findByText('PROD01 · Owner')).toBeTruthy();
});

it('groups the permissions the way the product is, in words', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Accountant'));
  expect(await screen.findByText('Money')).toBeTruthy();
  expect(screen.getByText('View payments')).toBeTruthy();
});

it('saves what was ticked', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Accountant'));
  await fireEvent.press(await screen.findByText('Record payments'));
  await fireEvent.press(screen.getByText('Save'));
  await waitFor(() =>
    expect(mockUpdate).toHaveBeenCalledWith('r2', {
      name: 'Accountant',
      permissions: [PERMISSIONS.PAYMENT_VIEW, PERMISSIONS.PAYMENT_RECORD],
    }),
  );
});

it('offers to remove a role the shop wrote, but never a seeded one', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Accountant'));
  expect(await screen.findByText('Remove this role')).toBeTruthy();
  await fireEvent.press(screen.getByText('Save'));

  await fireEvent.press(await screen.findByText('Owner'));
  expect(screen.queryByText('Remove this role')).toBeNull();
});

it('puts somebody on a different role', async () => {
  await mount();
  await fireEvent.press(screen.getByText('PROD01 · Owner'));
  await fireEvent(screen.getAllByTestId('select-trigger')[0], 'touchEnd');
  // The role card behind the sheet says "Accountant" too; the option in the
  // sheet is the last one rendered.
  const options = await screen.findAllByText('Accountant');
  await fireEvent.press(options[options.length - 1]);
  await waitFor(() => expect(mockAssign).toHaveBeenCalledWith('u1', 'r2'));
});

it('offers nothing but looking to somebody who may only look', async () => {
  mockPermissions = [PERMISSIONS.USER_VIEW];
  await mount();
  expect(screen.queryByText('New role')).toBeNull();
  await fireEvent.press(screen.getByText('Owner'));
  expect(screen.queryByText('Save')).toBeNull();
});
