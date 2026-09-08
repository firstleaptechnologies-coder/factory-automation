import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { PERMISSIONS } from '@decor/shared';
import { InvoiceDetailScreen } from './InvoiceDetailScreen';

const mockInvoice = jest.fn();
const mockReceivable = jest.fn();
const mockCancel = jest.fn();
const mockCredit = jest.fn();
jest.mock('../api/client', () => ({
  api: {
    invoice: (...a: unknown[]) => mockInvoice(...a),
    orderReceivable: (...a: unknown[]) => mockReceivable(...a),
    cancelInvoice: (...a: unknown[]) => mockCancel(...a),
    creditInvoice: (...a: unknown[]) => mockCredit(...a),
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
  orderId: 'o1',
  clientName: 'Verma Interiors',
  issuedOn: '2026-09-09',
  interState: false,
  subtotal: '10000',
  discount: '0',
  taxable: '10000',
  cgst: '900',
  sgst: '900',
  igst: '0',
  total: '11800',
  totalInWords: 'Eleven Thousand Eight Hundred Rupees only',
  items: [
    {
      id: 'li1',
      description: 'MDF · 18mm · 2400 × 1200 mm',
      hsn: '4411',
      quantity: '2',
      unit: 'nos',
      rate: '5000',
      amount: '10000',
      gstRatePct: '18',
      taxAmount: '1800',
      sortOrder: 0,
    },
  ],
  creditNotes: [],
};

const RECEIVABLE = {
  invoice: { id: 'i1', code: 'INV-2627-0001' },
  charged: 50000,
  credited: 5000,
  received: 45000,
  due: 0,
  settled: true,
};

const navigation = { goBack: jest.fn(), navigate: jest.fn() };

const mount = async (invoice: unknown = INVOICE, owed: unknown = RECEIVABLE) => {
  mockInvoice.mockResolvedValue(invoice);
  mockReceivable.mockResolvedValue(owed);
  await render(
    <InvoiceDetailScreen
      navigation={navigation as never}
      route={{ params: { invoiceId: 'i1' } } as never}
    />,
  );
  await waitFor(() => expect(mockInvoice).toHaveBeenCalled());
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPermissions = [
    PERMISSIONS.INVOICE_VIEW,
    PERMISSIONS.INVOICE_CANCEL,
    PERMISSIONS.CREDIT_NOTE_ISSUE,
  ];
  mockCancel.mockResolvedValue({});
  mockCredit.mockResolvedValue({});
  mockShare.mockResolvedValue(true);
});

it('shows the tax pair the invoice actually charged', async () => {
  await mount();
  // Which pair applies was decided when the invoice was raised. The screen
  // reports it rather than working it out again from the client's state today.
  expect(await screen.findByText('CGST + SGST')).toBeTruthy();
  expect(screen.queryByText('IGST')).toBeNull();
});

it('says IGST when the goods crossed a state line', async () => {
  await mount({ ...INVOICE, interState: true, cgst: '0', sgst: '0', igst: '1800' });
  expect(await screen.findByText('IGST')).toBeTruthy();
});

it('shows charged, credited and received as three separate figures', async () => {
  await mount();
  // Credited money is never counted as received: an order billed ₹50,000,
  // credited ₹5,000 and paid ₹45,000 is settled, and it says exactly that
  // rather than showing ₹50,000 collected.
  expect(await screen.findByText('Charged')).toBeTruthy();
  expect(screen.getByText('Credited')).toBeTruthy();
  expect(screen.getByText('Received')).toBeTruthy();
  expect(screen.getByText('₹50,000')).toBeTruthy();
  expect(screen.getByText('₹5,000')).toBeTruthy();
  expect(screen.getByText('₹45,000')).toBeTruthy();
  expect(screen.getByText('Settled')).toBeTruthy();
});

it('will not cancel without a reason', async () => {
  await mount();
  await fireEvent.press(await screen.findByText('Cancel this invoice'));
  await fireEvent.press(screen.getByText('Cancel it'));
  // The number stays used whatever happens, so the reason is the only record
  // of what it means now.
  expect(mockCancel).not.toHaveBeenCalled();

  await fireEvent.changeText(
    screen.getByPlaceholderText('Raised against the wrong client'),
    'Wrong client entirely',
  );
  await fireEvent.press(screen.getByText('Cancel it'));
  await waitFor(() => expect(mockCancel).toHaveBeenCalledWith('i1', 'Wrong client entirely'));
});

it('raises a credit note on the taxable value, with a reason and a sentence', async () => {
  await mount();
  await fireEvent.press(await screen.findByText('Raise a credit note'));
  await fireEvent.changeText(screen.getByPlaceholderText('0'), '5000');
  await fireEvent.changeText(
    screen.getByPlaceholderText('Two panels came back chipped'),
    'Two panels came back',
  );
  await fireEvent.press(screen.getByText('Raise it'));

  await waitFor(() =>
    expect(mockCredit).toHaveBeenCalledWith('i1', {
      taxable: 5000,
      reason: 'RETURN',
      note: 'Two panels came back',
    }),
  );
});

it('says a credit note is not a payment, on the sheet that raises one', async () => {
  await mount();
  await fireEvent.press(await screen.findByText('Raise a credit note'));
  expect(
    screen.getByText(/It is not a payment and is never counted as one/),
  ).toBeTruthy();
});

it('offers neither action to somebody who may only look', async () => {
  mockPermissions = [PERMISSIONS.INVOICE_VIEW];
  await mount();
  await waitFor(() => expect(screen.queryByText('Cancel this invoice')).toBeNull());
  expect(screen.queryByText('Raise a credit note')).toBeNull();
});

it('will not offer to cancel an invoice that has been credited', async () => {
  await mount({
    ...INVOICE,
    creditNotes: [
      {
        id: 'c1',
        code: 'CN-2627-0001',
        status: 'ISSUED',
        reason: 'RETURN',
        note: 'Two panels back',
        issuedOn: '2026-09-10',
        total: '5900',
      },
    ],
  });
  // Voiding the invoice under a live credit note would leave the note
  // crediting a document that says it was never worth anything.
  expect(await screen.findByText('CN-2627-0001')).toBeTruthy();
  expect(screen.queryByText('Cancel this invoice')).toBeNull();
});

it('says on the screen why a cancelled invoice still has its number', async () => {
  await mount({ ...INVOICE, status: 'CANCELLED', cancelReason: 'Wrong client' });
  expect(await screen.findByText('Wrong client')).toBeTruthy();
  expect(screen.getByText(/Nothing is deleted and nothing is reissued/)).toBeTruthy();
});

it('shares the invoice the server drew, rather than one drawn here', async () => {
  await mount();
  await fireEvent.press(await screen.findByText('Share the invoice'));
  // One layout and one set of totals, whether it is printed from the web or
  // turned into a PDF on the device.
  await waitFor(() =>
    expect(mockShare).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/invoices/i1/document', fileName: 'INV-2627-0001' }),
    ),
  );
});
