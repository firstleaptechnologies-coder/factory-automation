import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { PERMISSIONS } from '@fas/shared';
import { AdminRolesScreen } from './AdminRolesScreen';

const mockRoles = jest.fn();
const mockUsers = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockAssign = jest.fn();
const mockSetActive = jest.fn();
jest.mock('../../api/client', () => ({
  api: {
    roles: () => mockRoles(),
    users: () => mockUsers(),
    createRole: (...a: unknown[]) => mockCreate(...a),
    updateRole: (...a: unknown[]) => mockUpdate(...a),
    deleteRole: (...a: unknown[]) => mockDelete(...a),
    assignRole: (...a: unknown[]) => mockAssign(...a),
    setUserActive: (...a: unknown[]) => mockSetActive(...a),
  },
}));

let mockPermissions: string[] = [];
let mockModules: string[] = [];
jest.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({
    can: (p: string) => mockPermissions.includes(p),
    // What the workspace bought. The tree greys out the rest rather than
    // hiding it.
    has: (m: string) => mockModules.includes(m),
  }),
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
  mockModules = ['orders', 'clients', 'leads', 'quotes', 'finance'];
  mockRoles.mockResolvedValue([OWNER, ACCOUNTANT]);
  mockUsers.mockResolvedValue([USER]);
  mockCreate.mockResolvedValue(ACCOUNTANT);
  mockUpdate.mockResolvedValue(ACCOUNTANT);
  mockDelete.mockResolvedValue({ id: 'r2' });
  mockAssign.mockResolvedValue(USER);
  mockSetActive.mockResolvedValue(USER);
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

// Ten sections open at once is a screen nobody scrolls to the end of, so a
// section is shut until somebody opens it.
const openSection = async (label: string) => {
  await fireEvent.press(await screen.findByText(label));
};

it('shows the permissions as a tree, a section at a time', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Accountant'));

  // Shut: the section is named, the permissions inside it are not shown.
  expect(await screen.findByText('Finances')).toBeTruthy();
  expect(screen.queryByText('View payments')).toBeNull();

  await openSection('Finances');
  expect(await screen.findByText('Money in and out')).toBeTruthy();
  expect(screen.getByText('View payments')).toBeTruthy();
});

it('counts what is held under a section without opening it', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Accountant'));

  // Accountant holds one finance permission. Somebody scanning the list can
  // see that without opening ten sections.
  expect(await screen.findByText(/^1 of \d+$/)).toBeTruthy();
});

it('saves what was ticked', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Accountant'));
  await openSection('Finances');
  await fireEvent.press(await screen.findByText('Record payments'));
  await fireEvent.press(screen.getByText('Save'));
  await waitFor(() =>
    expect(mockUpdate).toHaveBeenCalledWith('r2', {
      name: 'Accountant',
      permissions: [PERMISSIONS.PAYMENT_VIEW, PERMISSIONS.PAYMENT_RECORD],
    }),
  );
});

// Somebody looking for Purchasing needs to see that it exists and is not on
// their plan, not conclude the product has no such thing.
it('greys a section the workspace has not bought rather than hiding it', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Accountant'));

  expect(await screen.findByText('Buying and stock')).toBeTruthy();
  // Named as the thing they would buy — the plan calls it Purchasing.
  expect(
    screen.getByText(/Purchasing is not on this workspace’s plan/),
  ).toBeTruthy();

  // And it cannot be ticked open into permissions that would grant nothing.
  await openSection('Buying and stock');
  expect(screen.queryByText('Record a purchase')).toBeNull();
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

/*
 * Letting somebody back in.
 *
 * The list drew "Switched off" and nothing anywhere could change it. The shop
 * that tried this had its production lead locked out with no way for the owner
 * to fix it — and the sign-in screen told him his password was wrong.
 */
describe('whether somebody may sign in', () => {
  const openPerson = async () => {
    await mount();
    await fireEvent.press(await screen.findByText('Production'));
  };

  it('switches a person off without deleting them', async () => {
    await openPerson();

    await fireEvent.press(screen.getByTestId('toggle-active'));

    // Never deleted: their name has to stay on every order they punched.
    await waitFor(() => expect(mockSetActive).toHaveBeenCalledWith('u1', false));
  });

  it('lets a switched-off person back in', async () => {
    mockUsers.mockResolvedValue([{ ...USER, isActive: false }]);
    await openPerson();

    await fireEvent.press(screen.getByTestId('toggle-active'));

    await waitFor(() => expect(mockSetActive).toHaveBeenCalledWith('u1', true));
  });

  it('says which way round it is', async () => {
    mockUsers.mockResolvedValue([{ ...USER, isActive: false }]);
    await openPerson();

    expect(screen.getByText('They cannot sign in. Tap to let them back in.')).toBeTruthy();
  });

  it('says what switching somebody off costs, which is nothing', async () => {
    await openPerson();

    expect(screen.getByText(/Everything they punched stays on the books/)).toBeTruthy();
  });
});
