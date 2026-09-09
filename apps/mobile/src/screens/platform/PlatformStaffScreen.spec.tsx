import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { PlatformStaffScreen } from './PlatformStaffScreen';

const mockRoles = jest.fn();
const mockStaff = jest.fn();
const mockSaveRole = jest.fn();
const mockSaveStaff = jest.fn();

jest.mock('../../api/client', () => ({
  api: {
    platformRoles: () => mockRoles(),
    platformStaff: () => mockStaff(),
    savePlatformRole: (...a: unknown[]) => mockSaveRole(...a),
    savePlatformStaff: (...a: unknown[]) => mockSaveStaff(...a),
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
  isSystem: true,
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
