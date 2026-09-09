import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { PERMISSIONS } from '@fas/shared';
import { PurchasesScreen } from './PurchasesScreen';

const mockPurchases = jest.fn();
jest.mock('../api/client', () => ({
  api: { purchases: (...a: unknown[]) => mockPurchases(...a) },
}));

let mockPermissions: string[] = [];
jest.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ can: (p: string) => mockPermissions.includes(p) }),
}));

const PURCHASE = {
  id: 'p1',
  code: 'PO-2627-0001',
  status: 'PART_RECEIVED',
  vendorId: 'v1',
  vendor: { id: 'v1', code: 'VEN-0001', name: 'Verma Boards' },
  billNumber: 'VB/2026/114',
  total: 10620,
  subtotal: 9000,
  taxTotal: 1620,
  otherCharges: 0,
  expectedOn: '2026-09-15',
  paidOn: null,
  createdAt: '2026-09-09T00:00:00Z',
};

const page = (rows: unknown[]) => ({
  data: rows,
  meta: { page: 1, pages: 1, total: rows.length, limit: 25 },
});

const navigation = { goBack: jest.fn(), navigate: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockPermissions = [PERMISSIONS.PURCHASE_VIEW, PERMISSIONS.PURCHASE_MANAGE];
  mockPurchases.mockResolvedValue(page([PURCHASE]));
});

const mount = async () => {
  await render(<PurchasesScreen navigation={navigation as never} />);
  await waitFor(() => expect(mockPurchases).toHaveBeenCalled());
};

it('says who it is from, what it comes to and where it has got to', async () => {
  await mount();
  expect(await screen.findByText('Verma Boards')).toBeTruthy();
  expect(screen.getByText('PO-2627-0001 · bill VB/2026/114')).toBeTruthy();
  expect(screen.getByText('₹10,620')).toBeTruthy();
  expect(screen.getByText('Part arrived')).toBeTruthy();
});

it('narrows to one standing when asked', async () => {
  await mount();
  await fireEvent.press(screen.getByTestId('filter-button'));
  await fireEvent.press(await screen.findByText('Arrived'));
  await fireEvent.press(screen.getByText('Apply 1 filter'));
  await waitFor(() =>
    expect(mockPurchases).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'RECEIVED' }),
    ),
  );
});

it('searches the number, the vendor and their bill', async () => {
  await mount();
  await fireEvent.changeText(
    screen.getByPlaceholderText('Order number, vendor or their bill'),
    'VB/2026',
  );
  await waitFor(() =>
    expect(mockPurchases).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'VB/2026' }),
    ),
  );
});

it('opens one, and the form for a new one', async () => {
  await mount();
  await fireEvent.press(await screen.findByText('Verma Boards'));
  expect(navigation.navigate).toHaveBeenCalledWith('PurchaseDetail', { id: 'p1' });
  await fireEvent.press(screen.getByTestId('new-purchase'));
  expect(navigation.navigate).toHaveBeenCalledWith('PurchaseEdit', {});
});

it('offers writing an order only to whoever may', async () => {
  mockPermissions = [PERMISSIONS.PURCHASE_VIEW];
  await mount();
  expect(screen.queryByTestId('new-purchase')).toBeNull();
});
