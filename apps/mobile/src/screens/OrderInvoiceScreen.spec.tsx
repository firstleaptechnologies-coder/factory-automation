import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { PERMISSIONS } from '@decor/shared';
import { OrderInvoiceScreen } from './OrderInvoiceScreen';

const mockOrderInvoice = jest.fn();
const mockReceivable = jest.fn();
const mockChallans = jest.fn();
const mockRaise = jest.fn();
const mockIssueChallan = jest.fn();
jest.mock('../api/client', () => ({
  api: {
    orderInvoice: (...a: unknown[]) => mockOrderInvoice(...a),
    orderReceivable: (...a: unknown[]) => mockReceivable(...a),
    challans: (...a: unknown[]) => mockChallans(...a),
    raiseInvoice: (...a: unknown[]) => mockRaise(...a),
    issueChallan: (...a: unknown[]) => mockIssueChallan(...a),
  },
}));

const mockShare = jest.fn();
jest.mock('../lib/documents', () => ({
  shareDocument: (...a: unknown[]) => mockShare(...a),
}));

let mockPermissions: string[] = [];
jest.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ can: (p: string) => mockPermissions.includes(p) }),
}));

const INVOICE = {
  id: 'i1',
  code: 'INV-2627-0001',
  status: 'ISSUED',
  issuedOn: '2026-09-09',
  total: '11800',
};

const RECEIVABLE = {
  invoice: { id: 'i1', code: 'INV-2627-0001' },
  charged: 50000,
  credited: 5000,
  received: 45000,
  due: 0,
  settled: true,
};

const CHALLAN = {
  id: 'd1',
  code: 'DC-2627-0001',
  status: 'ISSUED',
  issuedOn: '2026-09-09',
  shipTo: 'Site 4, Boranada',
  vehicle: 'RJ19 GA 4412',
};

const navigation = { goBack: jest.fn(), navigate: jest.fn() };

const mount = async (
  invoice: unknown = INVOICE,
  owed: unknown = RECEIVABLE,
  loads: unknown = [CHALLAN],
) => {
  mockOrderInvoice.mockResolvedValue(invoice);
  mockReceivable.mockResolvedValue(owed);
  mockChallans.mockResolvedValue(loads);
  await render(
    <OrderInvoiceScreen
      navigation={navigation as never}
      route={{ params: { orderId: 'o1', orderCode: 'ORD-2627-0007' } } as never}
    />,
  );
  await waitFor(() => expect(mockOrderInvoice).toHaveBeenCalled());
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPermissions = [PERMISSIONS.INVOICE_VIEW, PERMISSIONS.INVOICE_ISSUE];
  mockRaise.mockResolvedValue({ id: 'i9' });
  mockIssueChallan.mockResolvedValue({});
  mockShare.mockResolvedValue(true);
});

it('offers to raise the one invoice when the order has none', async () => {
  await mount(null, null, []);
  expect(await screen.findByText('Not invoiced yet')).toBeTruthy();
  await fireEvent.press(screen.getByText('Raise the invoice'));
  await waitFor(() => expect(mockRaise).toHaveBeenCalledWith('o1'));
  expect(navigation.navigate).toHaveBeenCalledWith('InvoiceDetail', { invoiceId: 'i9' });
});

it('says a correction is a credit note rather than a second bill', async () => {
  await mount(null, null, []);
  // One invoice per order: progressive billing would mean deciding which lines
  // belong to which invoice, and this shop bills a job when it goes out.
  expect(
    await screen.findByText(/a correction is a credit note\s+rather than a second bill/),
  ).toBeTruthy();
});

it('shows charged, credited and received as three separate figures', async () => {
  await mount();
  // Never one number. An order must not be able to look paid by money nobody
  // collected.
  expect(await screen.findByText('₹50,000')).toBeTruthy();
  expect(screen.getByText('₹5,000')).toBeTruthy();
  expect(screen.getByText('₹45,000')).toBeTruthy();
  expect(screen.getByText('Settled')).toBeTruthy();
});

it('lists a challan for each load, and says why there can be several', async () => {
  await mount();
  expect(await screen.findByText('DC-2627-0001')).toBeTruthy();
  expect(screen.getByText(/One per load/)).toBeTruthy();
});

it('issues a challan to somewhere other than the billing address', async () => {
  await mount();
  await fireEvent.press(await screen.findByText('Issue one'));
  await fireEvent.changeText(
    screen.getByPlaceholderText("Leave blank for the client's site address"),
    'Site 9, Pali Road',
  );
  await fireEvent.changeText(screen.getByPlaceholderText('RJ19 GA 4412'), 'RJ19 GA 4412');
  await fireEvent.press(screen.getByText('Issue it'));

  await waitFor(() =>
    expect(mockIssueChallan).toHaveBeenCalledWith('o1', {
      shipTo: 'Site 9, Pali Road',
      transport: undefined,
      vehicle: 'RJ19 GA 4412',
    }),
  );
});

it('lets somebody who may only look do neither', async () => {
  mockPermissions = [PERMISSIONS.INVOICE_VIEW];
  await mount(null, null, []);
  await waitFor(() => expect(screen.queryByText('Raise the invoice')).toBeNull());
  expect(screen.queryByText('Issue one')).toBeNull();
});

it('shares the challan the server drew, rather than one drawn here', async () => {
  await mount();
  await fireEvent.press(await screen.findByText('Share'));
  await waitFor(() =>
    expect(mockShare).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/challans/d1/document', fileName: 'DC-2627-0001' }),
    ),
  );
});
