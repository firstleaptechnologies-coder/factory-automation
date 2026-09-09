import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { PlatformStaffScreen } from './PlatformStaffScreen';

const mockRoles = jest.fn();
const mockStaff = jest.fn();
const mockSaveRole = jest.fn();
const mockSaveStaff = jest.fn();
const mockCreateRole = jest.fn();
const mockDeleteRole = jest.fn();
const mockCreateStaff = jest.fn();

jest.mock('../../api/client', () => ({
  api: {
    platformRoles: () => mockRoles(),
    platformStaff: () => mockStaff(),
    savePlatformRole: (...a: unknown[]) => mockSaveRole(...a),
    savePlatformStaff: (...a: unknown[]) => mockSaveStaff(...a),
    createPlatformRole: (...a: unknown[]) => mockCreateRole(...a),
    deletePlatformRole: (...a: unknown[]) => mockDeleteRole(...a),
    createPlatformStaff: (...a: unknown[]) => mockCreateStaff(...a),
  },
}));

let mockPermissions: string[] = [];
jest.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({
    can: (p: string) => mockPermissions.includes(p),
    user: { id: 'me' },
  }),
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
  // One we wrote, so it can be removed. The seeded four cannot.
  isSystem: false,
  people: 0,
};

const ME = { id: 'me', email: 'nakul@firstleap.in', name: 'Nakul', role: 'OWNER', isActive: true };
const OTHER = { id: 'u2', email: 'dev@firstleap.in', name: 'Dev', role: 'SUPPORT', isActive: true };

const navigation = { goBack: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockPermissions = ['platform.staff.view', 'platform.staff.manage'];
  mockRoles.mockResolvedValue([OWNER, SUPPORT]);
  mockStaff.mockResolvedValue([ME, OTHER]);
  mockSaveRole.mockResolvedValue(OWNER);
  mockSaveStaff.mockResolvedValue(OTHER);
  mockCreateRole.mockResolvedValue({ key: 'ON_CALL' });
  mockDeleteRole.mockResolvedValue({ key: 'ON_CALL' });
  mockCreateStaff.mockResolvedValue(OTHER);
});

const mount = async () => {
  await render(<PlatformStaffScreen navigation={navigation as never} />);
  await waitFor(() => expect(mockRoles).toHaveBeenCalled());
};

it('lists the roles with how many of us are on each', async () => {
  await mount();

  expect(await screen.findByText('Owner')).toBeTruthy();
  expect(screen.getByText('2 permissions · 1 person')).toBeTruthy();
});

it('says which role each colleague is on', async () => {
  await mount();

  expect(await screen.findByText('dev@firstleap.in · Support')).toBeTruthy();
});

// So nobody strips their own powers by mistaking themselves for somebody else.
it('marks which one is you', async () => {
  await mount();

  expect(await screen.findByText('You')).toBeTruthy();
});

it('edits a role on the platform tree, not the shop’s', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Owner'));

  // A section from the platform tree...
  expect(await screen.findByText('What we charge')).toBeTruthy();
  // ...and none from the shop's.
  expect(screen.queryByText('Buying and stock')).toBeNull();
});

it('saves what was ticked', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Owner'));
  await fireEvent.press(await screen.findByText('Clients'));
  await fireEvent.press(await screen.findByText('Provision workspaces'));
  await fireEvent.press(screen.getByText('Save'));

  await waitFor(() =>
    expect(mockSaveRole).toHaveBeenCalledWith('OWNER', {
      name: 'Owner',
      permissions: [
        'platform.tenant.view',
        'platform.staff.manage',
        'platform.tenant.create',
      ],
    }),
  );
});

it('puts somebody on a different role', async () => {
  await mount();
  await fireEvent.press(screen.getByText('dev@firstleap.in · Support'));
  const options = await screen.findAllByText('Owner');
  await fireEvent.press(options[options.length - 1]);

  await waitFor(() => expect(mockSaveStaff).toHaveBeenCalledWith('u2', { role: 'OWNER' }));
});

it('switches somebody off', async () => {
  await mount();
  await fireEvent.press(screen.getByText('dev@firstleap.in · Support'));
  await fireEvent.press(await screen.findByText('Switch this person off'));

  await waitFor(() => expect(mockSaveStaff).toHaveBeenCalledWith('u2', { isActive: false }));
});

it('offers nothing but looking to somebody who may only look', async () => {
  mockPermissions = ['platform.staff.view'];
  await mount();
  await fireEvent.press(await screen.findByText('Owner'));

  expect(screen.queryByText('Save')).toBeNull();
});


describe('a role we write ourselves', () => {
  it('makes one, on the platform tree', async () => {
    await mount();
    await fireEvent.press(screen.getByText('New role'));

    // The tree that appears is the platform one, not the shop's.
    expect(await screen.findByText('What we charge')).toBeTruthy();
    expect(screen.queryByText('Buying and stock')).toBeNull();
  });

  it('sends the key and what was ticked', async () => {
    await mount();
    await fireEvent.press(screen.getByText('New role'));
    const fields = screen.getAllByDisplayValue('');
    await fireEvent.changeText(fields[0], 'On call');
    await fireEvent.changeText(fields[1], 'ON_CALL');
    await fireEvent.press(await screen.findByText('Clients'));
    await fireEvent.press(await screen.findByText('View tenants'));
    await fireEvent.press(screen.getByText('Save'));

    await waitFor(() =>
      expect(mockCreateRole).toHaveBeenCalledWith({
        key: 'ON_CALL',
        name: 'On call',
        permissions: ['platform.tenant.view'],
      }),
    );
  });

  /*
   * The seeded four are what a session falls back to when a role row has gone,
   * so removing one turns a missing row into a guess.
   */
  it('offers to remove one we wrote, but never a seeded one', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Support'));
    expect(await screen.findByText('Remove this role')).toBeTruthy();

    await fireEvent.press(screen.getByText('Owner'));
    await waitFor(() => expect(screen.queryByText('Remove this role')).toBeNull());
  });

  it('removes one', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Support'));
    await fireEvent.press(await screen.findByText('Remove this role'));

    await waitFor(() => expect(mockDeleteRole).toHaveBeenCalledWith('SUPPORT'));
  });
});

describe('adding a colleague', () => {
  it('sends what was typed', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Invite'));

    const fields = screen.getAllByDisplayValue('');
    await fireEvent.changeText(fields[0], 'Asha');
    await fireEvent.changeText(fields[1], 'asha@firstleap.in');
    const options = await screen.findAllByText('Support');
    await fireEvent.press(options[options.length - 1]);
    await fireEvent.changeText(screen.getAllByDisplayValue('')[0], 'first-one-please');
    await fireEvent.press(screen.getByText('Add them'));

    await waitFor(() =>
      expect(mockCreateStaff).toHaveBeenCalledWith({
        name: 'Asha',
        email: 'asha@firstleap.in',
        role: 'SUPPORT',
        password: 'first-one-please',
      }),
    );
  });
});

it('offers no creating or inviting to somebody who may only look', async () => {
  mockPermissions = ['platform.staff.view'];
  await mount();

  expect(screen.queryByText('New role')).toBeNull();
  expect(screen.queryByText('Invite')).toBeNull();
});
