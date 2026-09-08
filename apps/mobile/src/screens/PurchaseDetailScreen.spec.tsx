import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { PERMISSIONS } from '@decor/shared';
import { PurchaseDetailScreen } from './PurchaseDetailScreen';

const mockPurchase = jest.fn();
const mockPlace = jest.fn();
const mockReceive = jest.fn();
const mockBill = jest.fn();
const mockPay = jest.fn();
jest.mock('../api/client', () => ({
  api: {
    purchase: (...a: unknown[]) => mockPurchase(...a),
    placePurchase: (...a: unknown[]) => mockPlace(...a),
    receivePurchase: (...a: unknown[]) => mockReceive(...a),
    billPurchase: (...a: unknown[]) => mockBill(...a),
    payPurchase: (...a: unknown[]) => mockPay(...a),
  },
}));

let mockPermissions: string[] = [];
jest.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ can: (p: string) => mockPermissions.includes(p) }),
}));

const ITEM = {
  id: 'pi1',
  materialId: 'm1',
  material: { id: 'm1', code: 'PLY', name: 'Plywood', stockUnit: 'sheet' },
  thickness: { id: 't1', valueMm: 18, label: null },
  unit: 'sheet',
  quantity: 10,
  rate: 900,
  gstRatePct: 18,
  taxAmount: 1620,
  lineTotal: 10620,
  receivedQuantity: 0,
};

const purchase = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  code: 'PO-2627-0001',
  status: 'ORDERED',
  vendorId: 'v1',
  vendor: { id: 'v1', code: 'VEN-0001', name: 'Verma Boards' },
  items: [ITEM],
  subtotal: 9000,
  taxTotal: 1620,
  total: 10620,
  otherCharges: 0,
  billNumber: null,
  paidOn: null,
  createdAt: '2026-09-09T00:00:00Z',
  ...over,
});

const navigation = { goBack: jest.fn(), navigate: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockPermissions = [PERMISSIONS.PURCHASE_VIEW, PERMISSIONS.PURCHASE_MANAGE, PERMISSIONS.PURCHASE_PAY];
  mockPurchase.mockResolvedValue(purchase());
  mockPlace.mockResolvedValue(purchase());
  mockReceive.mockResolvedValue(purchase());
  mockBill.mockResolvedValue(purchase());
  mockPay.mockResolvedValue(purchase());
});

const mount = async (data: unknown = purchase()) => {
  mockPurchase.mockResolvedValue(data);
  await render(
    <PurchaseDetailScreen
      navigation={navigation as never}
      route={{ params: { id: 'p1' } } as never}
    />,
  );
  await waitFor(() => expect(mockPurchase).toHaveBeenCalled());
};

it('says what was ordered and what it comes to', async () => {
  await mount();
  // Once in the heading and once on the only line under it.
  expect(await screen.findAllByText('₹10,620')).toHaveLength(2);
  expect(screen.getByText('₹9,000 plus ₹1,620 tax')).toBeTruthy();
  expect(screen.getByText('0 arrived of 10')).toBeTruthy();
});

it('offers sending a draft, and nothing else', async () => {
  await mount(purchase({ status: 'DRAFT' }));
  expect(await screen.findByText('Send it')).toBeTruthy();
  expect(screen.queryByText('Something arrived')).toBeNull();
});

it('offers receiving once it has been sent', async () => {
  await mount();
  expect(await screen.findByText('Something arrived')).toBeTruthy();
  expect(screen.queryByText('Send it')).toBeNull();
});

it('opens the delivery sheet on what is still outstanding', async () => {
  await mount(purchase({ items: [{ ...ITEM, receivedQuantity: 4 }], status: 'PART_RECEIVED' }));
  await fireEvent.press(await screen.findByText('Something arrived'));
  // Six of ten are missing, so that is what the box says.
  expect(await screen.findByDisplayValue('6')).toBeTruthy();
});

it('puts what arrived on the rack', async () => {
  await mount();
  await fireEvent.press(await screen.findByText('Something arrived'));
  await fireEvent.press(await screen.findByText('Put it on the rack'));
  await waitFor(() =>
    expect(mockReceive).toHaveBeenCalledWith('p1', {
      lines: [{ purchaseItemId: 'pi1', quantity: 10 }],
    }),
  );
});

it('takes the vendor’s own bill number and date', async () => {
  await mount();
  await fireEvent.press(await screen.findByText('Their bill'));
  await fireEvent.changeText(screen.getAllByDisplayValue('')[0], 'VB/2026/114');
  await fireEvent.press(screen.getByText('Save it'));
  await waitFor(() =>
    expect(mockBill).toHaveBeenCalledWith('p1', expect.objectContaining({ billNumber: 'VB/2026/114' })),
  );
});

it('offers paying only once there is a bill', async () => {
  await mount();
  expect(screen.queryByText('Pay it')).toBeNull();
  await mount(purchase({ billNumber: 'VB/2026/114', billedOn: '2026-09-09' }));
  expect(await screen.findByText('Pay it')).toBeTruthy();
});

it('offers paying to nobody who may not', async () => {
  mockPermissions = [PERMISSIONS.PURCHASE_VIEW, PERMISSIONS.PURCHASE_MANAGE];
  await mount(purchase({ billNumber: 'VB/2026/114', billedOn: '2026-09-09' }));
  expect(screen.queryByText('Pay it')).toBeNull();
});
