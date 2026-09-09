import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { PERMISSIONS } from '@fas/shared';
import { VendorsScreen } from './VendorsScreen';

const mockVendors = jest.fn();
jest.mock('../api/client', () => ({
  api: { vendors: (...a: unknown[]) => mockVendors(...a) },
}));

let mockPermissions: string[] = [];
jest.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ can: (p: string) => mockPermissions.includes(p) }),
}));

const VENDOR = {
  id: 'v1',
  code: 'VEN-0001',
  name: 'Verma Boards',
  supplies: 'Plywood and MDF',
  isActive: true,
  _count: { purchases: 3 },
  createdAt: '2026-09-01T00:00:00Z',
};

const page = (rows: unknown[]) => ({
  data: rows,
  meta: { page: 1, pages: 1, total: rows.length, limit: 25 },
});

const navigation = { goBack: jest.fn(), navigate: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockPermissions = [PERMISSIONS.VENDOR_VIEW, PERMISSIONS.VENDOR_MANAGE];
  mockVendors.mockResolvedValue(page([VENDOR]));
});

const mount = async () => {
  await render(<VendorsScreen navigation={navigation as never} />);
  await waitFor(() => expect(mockVendors).toHaveBeenCalled());
};

it('says who they are and what they supply', async () => {
  await mount();
  expect(await screen.findByText('Verma Boards')).toBeTruthy();
  expect(screen.getByText('Plywood and MDF')).toBeTruthy();
  expect(screen.getByText('VEN-0001 · 3 purchases')).toBeTruthy();
});

it('says so plainly when nobody has said what they supply', async () => {
  mockVendors.mockResolvedValue(page([{ ...VENDOR, supplies: null }]));
  await mount();
  expect(await screen.findByText('Nothing said about what they supply')).toBeTruthy();
});

it('leaves the retired ones out until they are asked for', async () => {
  await mount();
  expect(mockVendors.mock.calls[0][0].includeInactive).toBeUndefined();
  await fireEvent.press(screen.getByTestId('include-retired'));
  await waitFor(() =>
    expect(mockVendors).toHaveBeenLastCalledWith(
      expect.objectContaining({ includeInactive: true }),
    ),
  );
});

it('opens one, and the form for a new one', async () => {
  await mount();
  await fireEvent.press(await screen.findByText('Verma Boards'));
  expect(navigation.navigate).toHaveBeenCalledWith('VendorDetail', { id: 'v1' });
  await fireEvent.press(screen.getByTestId('add-vendor'));
  expect(navigation.navigate).toHaveBeenCalledWith('VendorDetail', {});
});

it('offers adding one only to whoever may', async () => {
  mockPermissions = [PERMISSIONS.VENDOR_VIEW];
  await mount();
  expect(screen.queryByTestId('add-vendor')).toBeNull();
});
