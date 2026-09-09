import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PERMISSIONS } from '@fas/shared';
import PurchasesPage from './page';

const apiMock = { purchases: jest.fn() };
jest.mock('@/lib/api', () => ({
  api: new Proxy(
    {},
    {
      get: (_t, key: string) => (...args: never[]) =>
        (apiMock[key as keyof typeof apiMock] as (...a: never[]) => unknown)(...args),
    },
  ),
}));

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

let permissions: string[] = [];
jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ can: (p: string) => permissions.includes(p) }),
}));

jest.mock('@/components/Shell', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
  meta: { page: 1, limit: 25, total: rows.length, pages: 1 },
});

beforeEach(() => {
  jest.clearAllMocks();
  permissions = [PERMISSIONS.PURCHASE_VIEW, PERMISSIONS.PURCHASE_MANAGE];
  apiMock.purchases.mockResolvedValue(page([PURCHASE]));
});

const mount = async () => {
  render(<PurchasesPage />);
  await screen.findByText('Purchases');
};

it('says who it is from, what it comes to and where it has got to', async () => {
  await mount();
  expect(await screen.findByText('Verma Boards')).toBeInTheDocument();
  expect(screen.getByText('PO-2627-0001')).toBeInTheDocument();
  expect(screen.getByText('VB/2026/114')).toBeInTheDocument();
  expect(screen.getByText('Part arrived')).toBeInTheDocument();
});

it('narrows to one standing when asked', async () => {
  await mount();
  fireEvent.click(screen.getByText('Filter'));
  fireEvent.click(await screen.findByText('Arrived'));
  fireEvent.click(screen.getByText(/Apply/));
  await waitFor(() =>
    expect(apiMock.purchases).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'RECEIVED' }),
    ),
  );
});

it('opens one, and the form for a new order', async () => {
  await mount();
  fireEvent.click(await screen.findByText('Verma Boards'));
  expect(push).toHaveBeenCalledWith('/purchases/p1');
  fireEvent.click(screen.getByText('New order'));
  expect(push).toHaveBeenCalledWith('/purchases/new');
});

it('offers writing an order only to whoever may', async () => {
  permissions = [PERMISSIONS.PURCHASE_VIEW];
  await mount();
  expect(screen.queryByText('New order')).toBeNull();
});
