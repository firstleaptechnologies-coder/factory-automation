import { act, render, screen } from '@testing-library/react';
import InvoicesPage from './page';

const apiMock = { invoices: jest.fn() };
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

jest.mock('@/components/Shell', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const ROWS = [
  {
    id: 'i1',
    code: 'INV-2627-0001',
    status: 'ISSUED',
    clientName: 'Verma Interiors',
    order: { id: 'o1', code: 'ORD-2627-0007' },
    issuedOn: '2026-09-09',
    total: '11800',
  },
  {
    id: 'i2',
    code: 'INV-2627-0002',
    status: 'CANCELLED',
    clientName: 'Sharma Builders',
    order: { id: 'o2', code: 'ORD-2627-0008' },
    issuedOn: '2026-09-08',
    total: '5000',
  },
];

const mount = async (rows: unknown = ROWS) => {
  apiMock.invoices.mockResolvedValue(rows);
  await act(async () => {
    render(<InvoicesPage />);
  });
  await screen.findByText('Billed');
};

beforeEach(() => jest.clearAllMocks());

it('lists what was billed, and what it was billed against', async () => {
  await mount();
  expect(screen.getByText('INV-2627-0001')).toBeInTheDocument();
  expect(screen.getByText(/Verma Interiors · ORD-2627-0007/)).toBeInTheDocument();
});

it('counts nothing a cancelled invoice claimed', async () => {
  await mount();
  // A cancelled invoice keeps its number and claims nothing. Adding it to the
  // total would overstate the month's billing by a document that is void.
  // Twice: the hero total, and the one issued row it came from.
  expect(screen.getAllByText('₹11,800')).toHaveLength(2);
  expect(screen.queryByText('₹16,800')).not.toBeInTheDocument();
});

it('says which of them is void, on the row itself', async () => {
  await mount();
  expect(screen.getByText('Cancelled')).toBeInTheDocument();
  expect(screen.getByText('Issued')).toBeInTheDocument();
});

it('searches the number, the client and the order together', async () => {
  await mount();
  // Somebody holding a piece of paper has one of the three and does not know
  // which of them the system calls it.
  expect(
    screen.getByPlaceholderText('Invoice number, client or order'),
  ).toBeInTheDocument();
});

it('says nothing has been billed rather than showing an empty page', async () => {
  await mount([]);
  expect(screen.getByText('Nothing billed yet')).toBeInTheDocument();
});
