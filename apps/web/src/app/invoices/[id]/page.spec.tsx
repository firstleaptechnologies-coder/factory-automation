import { Suspense } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PERMISSIONS } from '@fas/shared';
import InvoicePage from './page';

const apiMock = {
  invoice: jest.fn(),
  orderReceivable: jest.fn(),
  cancelInvoice: jest.fn(),
  creditInvoice: jest.fn(),
  invoiceDocumentUrl: jest.fn(),
  creditNoteDocumentUrl: jest.fn(),
};
jest.mock('@/lib/api', () => ({
  api: new Proxy(
    {},
    {
      get: (_t, key: string) => (...args: unknown[]) =>
        apiMock[key as keyof typeof apiMock](...args),
    },
  ),
}));

let granted: string[] = [];
jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, can: (p: string) => granted.includes(p) }),
}));

jest.mock('@/components/Shell', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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

const mount = async (invoice: unknown = INVOICE, owed: unknown = RECEIVABLE) => {
  apiMock.invoice.mockResolvedValue(invoice);
  apiMock.orderReceivable.mockResolvedValue(owed);
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <InvoicePage params={Promise.resolve({ id: 'i1' })} />
      </Suspense>,
    );
  });
  await screen.findByText('Billed');
};

const field = (label: string) =>
  Array.from(document.querySelectorAll('label.field'))
    .find((node) => node.querySelector('.field-label')?.textContent?.startsWith(label))!
    .querySelector('input, textarea') as HTMLInputElement;

beforeEach(() => {
  jest.clearAllMocks();
  granted = [PERMISSIONS.INVOICE_VIEW, PERMISSIONS.INVOICE_CANCEL, PERMISSIONS.CREDIT_NOTE_ISSUE];
  apiMock.cancelInvoice.mockResolvedValue({});
  apiMock.creditInvoice.mockResolvedValue({});
  apiMock.invoiceDocumentUrl.mockImplementation(
    (id: unknown) => `https://api.test/invoices/${id}/document`,
  );
  apiMock.creditNoteDocumentUrl.mockImplementation(
    (id: unknown) => `https://api.test/credit-notes/${id}/document`,
  );
  window.open = jest.fn();
});

it('shows the tax pair the invoice actually charged', async () => {
  await mount();
  // Which pair applies was decided when the invoice was raised. The screen
  // reports it rather than working it out again from the client's state today.
  expect(screen.getByText('CGST + SGST')).toBeInTheDocument();
  expect(screen.queryByText('IGST')).not.toBeInTheDocument();
});

it('says IGST when the goods crossed a state line', async () => {
  await mount({ ...INVOICE, interState: true, cgst: '0', sgst: '0', igst: '1800' });
  expect(screen.getByText('IGST')).toBeInTheDocument();
});

it('shows charged, credited and received as three separate figures', async () => {
  await mount();
  // Credited money is never counted as received: an order billed ₹50,000,
  // credited ₹5,000 and paid ₹45,000 is settled, and it says exactly that
  // rather than showing ₹50,000 collected.
  expect(screen.getByText('Charged')).toBeInTheDocument();
  expect(screen.getByText('Credited')).toBeInTheDocument();
  expect(screen.getByText('Received')).toBeInTheDocument();
  expect(screen.getByText('₹50,000')).toBeInTheDocument();
  expect(screen.getByText('₹5,000')).toBeInTheDocument();
  expect(screen.getByText('₹45,000')).toBeInTheDocument();
  expect(screen.getByText('Settled')).toBeInTheDocument();
});

it('will not cancel without a reason', async () => {
  await mount();
  fireEvent.click(screen.getByText('Cancel this invoice'));
  const button = await screen.findByRole('button', { name: 'Cancel it' });
  // The number stays used whatever happens, so the reason is the only record
  // of what it means now.
  expect(button).toBeDisabled();

  fireEvent.change(field('Why'), { target: { value: 'Raised against the wrong client' } });
  await waitFor(() => expect(button).not.toBeDisabled());
  fireEvent.click(button);
  await waitFor(() =>
    expect(apiMock.cancelInvoice).toHaveBeenCalledWith('i1', 'Raised against the wrong client'),
  );
});

it('raises a credit note on the taxable value, with a reason and a sentence', async () => {
  await mount();
  fireEvent.click(screen.getByText('Raise a credit note'));
  fireEvent.change(field('Taxable value'), { target: { value: '5000' } });
  fireEvent.change(field('In your own words'), { target: { value: 'Two panels came back' } });
  fireEvent.click(screen.getByRole('button', { name: 'Raise it' }));

  await waitFor(() =>
    expect(apiMock.creditInvoice).toHaveBeenCalledWith('i1', {
      taxable: 5000,
      reason: 'RETURN',
      note: 'Two panels came back',
    }),
  );
});

it('offers neither action to somebody who may only look', async () => {
  granted = [PERMISSIONS.INVOICE_VIEW];
  await mount();
  expect(screen.queryByText('Cancel this invoice')).not.toBeInTheDocument();
  expect(screen.queryByText('Raise a credit note')).not.toBeInTheDocument();
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
  expect(screen.getByText('CN-2627-0001')).toBeInTheDocument();
  expect(screen.queryByText('Cancel this invoice')).not.toBeInTheDocument();
});

it('says on the page why a cancelled invoice still has its number', async () => {
  await mount({ ...INVOICE, status: 'CANCELLED', cancelReason: 'Wrong client' });
  expect(screen.getByText('Wrong client')).toBeInTheDocument();
  expect(screen.getByText(/Nothing is deleted and nothing is reissued/)).toBeInTheDocument();
});

it('opens the printable invoice at the API', async () => {
  await mount();
  fireEvent.click(screen.getByText('Open the invoice'));
  expect(window.open).toHaveBeenCalledWith('https://api.test/invoices/i1/document', '_blank');
});
