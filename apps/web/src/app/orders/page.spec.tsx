import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PERMISSIONS } from '@decor/shared';
import OrdersPage from './page';

const apiMock = {
  orders: jest.fn(),
  defaultWorkflow: jest.fn(),
  materials: jest.fn(),
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

const ORDER = {
  id: 'o1',
  code: 'ORD-1',
  client: { name: 'Verma Interiors' },
  location: 'Andheri',
  createdAt: new Date().toISOString(),
  grandTotal: '29500',
  status: { name: 'Cutting', color: '#FF6B1A' },
  items: [
    {
      id: 'i1',
      quantity: 3,
      material: { name: 'Plywood', color: '#C08A4B' },
      display: { length: 8, width: 4, unit: 'FT' },
    },
  ],
};

async function mount(orders: unknown[] = [ORDER], total = orders.length) {
  apiMock.orders.mockResolvedValue({
    data: orders,
    meta: { page: 1, pages: 1, total, limit: 25 },
    unit: 'FT',
  });
  render(<OrdersPage />);
  await screen.findByText('Orders');
  await waitFor(() => expect(apiMock.orders).toHaveBeenCalled());
}

const lastQuery = () => apiMock.orders.mock.calls.at(-1)![0];

beforeEach(() => {
  jest.clearAllMocks();
  granted = [PERMISSIONS.ORDER_PUNCH];
  apiMock.defaultWorkflow.mockResolvedValue({
    id: 'w1',
    statuses: [{ id: 's2', name: 'Cutting', color: '#FF6B1A' }],
  });
  apiMock.materials.mockResolvedValue([{ id: 'm1', name: 'Plywood', color: '#C08A4B' }]);
});

it('says how many orders there are in total', async () => {
  await mount([ORDER], 137);
  expect(screen.getByText('137 total')).toBeInTheDocument();
});

it('shows each order with its client, code, site and stage', async () => {
  await mount();
  expect(screen.getByText('Verma Interiors')).toBeInTheDocument();
  expect(screen.getByText(/ORD-1 · Andheri/)).toBeInTheDocument();
  expect(screen.getAllByText('Cutting').length).toBeGreaterThan(0);
});

it('lists the lines on each order', async () => {
  await mount();
  expect(screen.getByText(/8 × 4 ft · Plywood × 3/)).toBeInTheDocument();
});

it('draws a dash for a line with no size', async () => {
  await mount([{ ...ORDER, items: [{ ...ORDER.items[0], display: null }] }]);
  expect(screen.getByText(/— · Plywood × 3/)).toBeInTheDocument();
});

it('shows a price only once there is one', async () => {
  await mount([ORDER, { ...ORDER, id: 'o2', grandTotal: '0' }]);
  expect(screen.getAllByText('₹29,500')).toHaveLength(1);
});

it('opens an order', async () => {
  await mount();
  fireEvent.click(screen.getByText('Verma Interiors'));
  expect(push).toHaveBeenCalledWith('/orders/o1');
});

it('says so when nothing matches', async () => {
  await mount([]);
  expect(screen.getByText('No orders match')).toBeInTheDocument();
  expect(screen.getByText('Try clearing the search or the filters.')).toBeInTheDocument();
});

describe('searching and filtering', () => {
  it('searches on what was typed', async () => {
    await mount();
    fireEvent.change(screen.getByPlaceholderText('Order number, client or location'), {
      target: { value: 'ORD-1' },
    });
    await waitFor(() => expect(lastQuery().search).toBe('ORD-1'));
  });

  it('re-reads the list in the unit that was picked', async () => {
    await mount();
    fireEvent.click(screen.getByText('mm'));
    await waitFor(() => expect(lastQuery().unit).toBe('MM'));
  });

  it('says how many filters are on', async () => {
    await mount();
    expect(screen.getByText('Filter')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Filter'));
    fireEvent.click((await screen.findAllByText('Cutting')).at(-1)!);
    fireEvent.click(screen.getByText('Apply 1 filter'));
    await waitFor(() => expect(screen.getByText('1 filter')).toBeInTheDocument());
  });

  it('filters by stage and material together', async () => {
    await mount();
    fireEvent.click(screen.getByText('Filter'));
    fireEvent.click((await screen.findAllByText('Cutting')).at(-1)!);
    fireEvent.click(screen.getAllByText('Plywood').at(-1)!);
    fireEvent.click(screen.getByText('Apply 2 filters'));
    await waitFor(() => expect(lastQuery().statusId).toBe('s2'));
    expect(lastQuery().materialId).toBe('m1');
  });

  it('clears them again', async () => {
    await mount();
    fireEvent.click(screen.getByText('Filter'));
    fireEvent.click((await screen.findAllByText('Cutting')).at(-1)!);
    fireEvent.click(screen.getByText('Apply 1 filter'));
    await waitFor(() => expect(lastQuery().statusId).toBe('s2'));
    fireEvent.click(screen.getByText('1 filter'));
    fireEvent.click(await screen.findByText('Clear all'));
    await waitFor(() => expect(lastQuery().statusId).toBeUndefined());
  });

  it('asks for the first page again whenever a filter changes', async () => {
    await mount();
    fireEvent.change(screen.getByPlaceholderText('Order number, client or location'), {
      target: { value: 'x' },
    });
    // A stale page three of a different search would be nonsense.
    await waitFor(() => expect(lastQuery().page).toBe(1));
  });
});

describe('the ways out of the list', () => {
  it('opens the board, which is this list arranged differently', async () => {
    await mount();
    fireEvent.click(screen.getByText('Board'));
    expect(push).toHaveBeenCalledWith('/board');
  });

  it('punches a new order', async () => {
    await mount();
    fireEvent.click(screen.getByText('Punch order'));
    expect(push).toHaveBeenCalledWith('/punch');
  });

  it('offers punching only to somebody who may punch', async () => {
    granted = [];
    await mount();
    expect(screen.queryByText('Punch order')).not.toBeInTheDocument();
    // The board is still there — looking is not punching.
    expect(screen.getByText('Board')).toBeInTheDocument();
  });
});
