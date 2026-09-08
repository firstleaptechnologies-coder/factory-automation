import { Suspense } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PERMISSIONS } from '@decor/shared';
import OrderInvoicePage from './page';

const apiMock = {
  orderInvoice: jest.fn(),
  orderReceivable: jest.fn(),
  challans: jest.fn(),
  raiseInvoice: jest.fn(),
  issueChallan: jest.fn(),
  challanDocumentUrl: jest.fn(),
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

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

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

const mount = async (
  invoice: unknown = INVOICE,
  owed: unknown = RECEIVABLE,
  loads: unknown = [CHALLAN],
) => {
  apiMock.orderInvoice.mockResolvedValue(invoice);
  apiMock.orderReceivable.mockResolvedValue(owed);
  apiMock.challans.mockResolvedValue(loads);
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <OrderInvoicePage params={Promise.resolve({ id: 'o1' })} />
      </Suspense>,
    );
  });
  await screen.findByText('Invoice and challans');
};

const field = (label: string) =>
  Array.from(document.querySelectorAll('label.field'))
    .find((node) => node.querySelector('.field-label')?.textContent?.startsWith(label))!
    .querySelector('input, textarea') as HTMLInputElement;

beforeEach(() => {
  jest.clearAllMocks();
  granted = [PERMISSIONS.INVOICE_VIEW, PERMISSIONS.INVOICE_ISSUE];
  apiMock.raiseInvoice.mockResolvedValue({ id: 'i9' });
  apiMock.issueChallan.mockResolvedValue({});
  apiMock.challanDocumentUrl.mockImplementation(
    (id: unknown) => `https://api.test/challans/${id}/document`,
  );
  window.open = jest.fn();
});

it('offers to raise the one invoice when the order has none', async () => {
  await mount(null, null, []);
  expect(screen.getByText('Not invoiced yet')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Raise the invoice'));
  await waitFor(() => expect(apiMock.raiseInvoice).toHaveBeenCalledWith('o1'));
  expect(push).toHaveBeenCalledWith('/invoices/i9');
});

it('says a correction is a credit note rather than a second bill', async () => {
  await mount(null, null, []);
  // One invoice per order: progressive billing would mean deciding which lines
  // belong to which invoice, and this shop bills a job when it goes out.
  expect(screen.getByText(/a correction is a credit note rather\s+than a second bill/)).toBeInTheDocument();
});

it('shows charged, credited and received as three separate figures', async () => {
  await mount();
  expect(screen.getByText('₹50,000')).toBeInTheDocument();
  expect(screen.getByText('₹5,000')).toBeInTheDocument();
  expect(screen.getByText('₹45,000')).toBeInTheDocument();
  // Never one number. An order must not be able to look paid by money nobody
  // collected.
  expect(screen.getByText('Settled')).toBeInTheDocument();
});

it('lists a challan for each load, and says why there can be several', async () => {
  await mount();
  expect(screen.getByText('DC-2627-0001')).toBeInTheDocument();
  expect(screen.getByText(/One per load/)).toBeInTheDocument();
});

it('issues a challan to somewhere other than the billing address', async () => {
  await mount();
  fireEvent.click(screen.getByText('Issue a challan'));
  fireEvent.change(field('Ship to'), { target: { value: 'Site 9, Pali Road' } });
  fireEvent.change(field('Vehicle'), { target: { value: 'RJ19 GA 4412' } });
  fireEvent.click(screen.getByRole('button', { name: 'Issue it' }));

  await waitFor(() =>
    expect(apiMock.issueChallan).toHaveBeenCalledWith('o1', {
      shipTo: 'Site 9, Pali Road',
      transport: undefined,
      vehicle: 'RJ19 GA 4412',
    }),
  );
});

it('lets somebody who may only look do neither', async () => {
  granted = [PERMISSIONS.INVOICE_VIEW];
  await mount(null, null, []);
  expect(screen.queryByText('Raise the invoice')).not.toBeInTheDocument();
  expect(screen.queryByText('Issue a challan')).not.toBeInTheDocument();
});

it('opens a challan at the API rather than redrawing it', async () => {
  await mount();
  fireEvent.click(screen.getByText('Open'));
  // The same markup the app turns into a PDF, so a challan printed here and
  // one shared from a phone are the same piece of paper.
  expect(window.open).toHaveBeenCalledWith('https://api.test/challans/d1/document', '_blank');
});
