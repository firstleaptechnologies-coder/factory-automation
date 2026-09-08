import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Suspense } from 'react';
import { PERMISSIONS } from '@decor/shared';
import PurchasePage from './page';

const apiMock = {
  purchase: jest.fn(),
  placePurchase: jest.fn(),
  receivePurchase: jest.fn(),
  billPurchase: jest.fn(),
  payPurchase: jest.fn(),
  vendors: jest.fn(),
  materials: jest.fn(),
};
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
let query = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => query,
}));

let permissions: string[] = [];
jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ can: (p: string) => permissions.includes(p) }),
}));

jest.mock('@/components/Shell', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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

beforeEach(() => {
  jest.clearAllMocks();
  query = new URLSearchParams();
  permissions = [
    PERMISSIONS.PURCHASE_VIEW,
    PERMISSIONS.PURCHASE_MANAGE,
    PERMISSIONS.PURCHASE_PAY,
  ];
  apiMock.purchase.mockResolvedValue(purchase());
  apiMock.placePurchase.mockResolvedValue(purchase());
  apiMock.receivePurchase.mockResolvedValue(purchase());
  apiMock.billPurchase.mockResolvedValue(purchase());
  apiMock.payPurchase.mockResolvedValue(purchase());
  apiMock.vendors.mockResolvedValue({ data: [], meta: { page: 1, pages: 1, total: 0, limit: 200 } });
  apiMock.materials.mockResolvedValue([]);
});

const mount = async (data: unknown = purchase()) => {
  apiMock.purchase.mockResolvedValue(data);
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <PurchasePage params={Promise.resolve({ id: 'p1' })} />
      </Suspense>,
    );
  });
};

it('says what was ordered, what it comes to and what has arrived', async () => {
  await mount();
  expect(await screen.findByText('₹9,000 plus ₹1,620 tax')).toBeInTheDocument();
  expect(screen.getByText('10 sheet')).toBeInTheDocument();
});

it('offers sending a draft, and nothing else', async () => {
  await mount(purchase({ status: 'DRAFT' }));
  expect(await screen.findByText('Send it')).toBeInTheDocument();
  expect(screen.queryByText('Something arrived')).toBeNull();
});

it('opens the delivery sheet on what is still outstanding', async () => {
  await mount(purchase({ status: 'PART_RECEIVED', items: [{ ...ITEM, receivedQuantity: 4 }] }));
  fireEvent.click(await screen.findByText('Something arrived'));
  // Six of ten are missing, so that is what the box says.
  expect(await screen.findByDisplayValue('6')).toBeInTheDocument();
});

it('puts what arrived on the rack', async () => {
  await mount();
  fireEvent.click(await screen.findByText('Something arrived'));
  fireEvent.click(await screen.findByRole('button', { name: 'Put it on the rack' }));
  await waitFor(() =>
    expect(apiMock.receivePurchase).toHaveBeenCalledWith('p1', {
      lines: [{ purchaseItemId: 'pi1', quantity: 10 }],
    }),
  );
});

it('offers paying only once there is a bill', async () => {
  await mount();
  expect(screen.queryByText('Pay it')).toBeNull();
  await mount(purchase({ billNumber: 'VB/2026/114', billedOn: '2026-09-09' }));
  expect(await screen.findByText('Pay it')).toBeInTheDocument();
});

it('says why something was refused, rather than nothing', async () => {
  apiMock.placePurchase.mockRejectedValue(new Error('That order has been sent.'));
  await mount(purchase({ status: 'DRAFT' }));
  fireEvent.click(await screen.findByText('Send it'));
  expect(await screen.findByText('That order has been sent.')).toBeInTheDocument();
});

it('edits the draft on the same address rather than a page of its own', async () => {
  query = new URLSearchParams('edit=1');
  await mount(purchase({ status: 'DRAFT' }));
  expect(await screen.findByText('Edit order')).toBeInTheDocument();
});
