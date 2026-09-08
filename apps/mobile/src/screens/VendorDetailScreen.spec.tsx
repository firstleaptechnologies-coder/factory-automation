import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { PERMISSIONS } from '@decor/shared';
import { VendorDetailScreen } from './VendorDetailScreen';

const mockVendor = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockRetire = jest.fn();
jest.mock('../api/client', () => ({
  api: {
    vendor: (...a: unknown[]) => mockVendor(...a),
    createVendor: (...a: unknown[]) => mockCreate(...a),
    updateVendor: (...a: unknown[]) => mockUpdate(...a),
    retireVendor: (...a: unknown[]) => mockRetire(...a),
  },
}));

let mockPermissions: string[] = [];
jest.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ can: (p: string) => mockPermissions.includes(p) }),
}));

const VENDOR = {
  id: 'v1',
  code: 'VEN-0001',
  name: 'Verma Boards',
  phone: '9876543210',
  gstin: '08AAACH7409R1ZS',
  supplies: 'Plywood and MDF',
  isActive: true,
  createdAt: '2026-09-01T00:00:00Z',
};

const navigation = { goBack: jest.fn(), replace: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockPermissions = [PERMISSIONS.VENDOR_VIEW, PERMISSIONS.VENDOR_MANAGE];
  mockVendor.mockResolvedValue(VENDOR);
  mockCreate.mockResolvedValue({ id: 'v9' });
  mockUpdate.mockResolvedValue(VENDOR);
  mockRetire.mockResolvedValue({ ...VENDOR, isActive: false });
});

const mount = async (params: Record<string, unknown> = {}) => {
  await render(
    <VendorDetailScreen navigation={navigation as never} route={{ params } as never} />,
  );
  if (params.id) await waitFor(() => expect(mockVendor).toHaveBeenCalled());
};

it('adds one, and goes to the row it made', async () => {
  await mount();
  await fireEvent.changeText(screen.getByPlaceholderText('Verma Boards'), 'Sharma Ply');
  await fireEvent.press(screen.getByText('Add them'));
  await waitFor(() =>
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ name: 'Sharma Ply' })),
  );
  expect(navigation.replace).toHaveBeenCalledWith('VendorDetail', { id: 'v9' });
});

it('will not add one with no name', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Add them'));
  expect(mockCreate).not.toHaveBeenCalled();
});

it('opens an existing one with what is on file', async () => {
  await mount({ id: 'v1' });
  expect(await screen.findByDisplayValue('Verma Boards')).toBeTruthy();
  expect(screen.getByDisplayValue('08AAACH7409R1ZS')).toBeTruthy();
});

it('says what retiring does before it does it', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await mount({ id: 'v1' });
  await fireEvent.press(await screen.findByText('Retire'));
  expect(alert).toHaveBeenCalledWith(
    'Retire this vendor?',
    expect.stringContaining('every purchase ever placed hangs off it'),
    expect.any(Array),
  );
  expect(mockRetire).not.toHaveBeenCalled();
  alert.mockRestore();
});

it('does not offer to retire one already retired', async () => {
  mockVendor.mockResolvedValue({ ...VENDOR, isActive: false });
  await mount({ id: 'v1' });
  expect(await screen.findByText('VEN-0001 · retired')).toBeTruthy();
  expect(screen.queryByText('Retire')).toBeNull();
});

it('says plainly when somebody may look but not change', async () => {
  mockPermissions = [PERMISSIONS.VENDOR_VIEW];
  await mount({ id: 'v1' });
  expect(await screen.findByText('You may look at vendors but not change them.')).toBeTruthy();
});
