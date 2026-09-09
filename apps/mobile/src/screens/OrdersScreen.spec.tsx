import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { PERMISSIONS } from '@fas/shared';
import { OrdersScreen } from './OrdersScreen';

const mockOrders = jest.fn();
const mockDefaultWorkflow = jest.fn();
const mockMaterials = jest.fn();
jest.mock('../api/client', () => ({
  api: {
    orders: (...a: unknown[]) => mockOrders(...a),
    defaultWorkflow: () => mockDefaultWorkflow(),
    materials: () => mockMaterials(),
  },
}));

const ORDER = {
  id: 'o1',
  code: 'ORD-2627-0002',
  createdAt: '2026-09-06T10:00:00Z',
  location: 'Andheri West',
  client: { name: 'Verma Interiors' },
  status: { name: 'Cutting', color: '#FF6B1A' },
  items: [
    {
      id: 'i1',
      quantity: 2,
      material: { name: 'MDF', color: '#B98B54' },
      display: { length: 8, width: 4, unit: 'FT', thickness: 18, thicknessUnit: 'MM' },
    },
  ],
};

const page = (data: unknown[], total = data.length) => ({
  data,
  meta: { page: 1, pages: 1, total, limit: 25 },
});

let mockGranted: string[] = [];
jest.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ can: (p: string) => mockGranted.includes(p) }),
}));

const navigate = jest.fn();

async function mount(params?: Record<string, unknown>) {
  await render(<OrdersScreen route={{ params }} navigation={{ navigate }} />);
  await waitFor(() => expect(mockOrders).toHaveBeenCalled());
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGranted = [PERMISSIONS.ORDER_PUNCH];
  mockOrders.mockResolvedValue(page([ORDER], 137));
  mockDefaultWorkflow.mockResolvedValue({
    statuses: [{ id: 's1', name: 'Cutting', color: '#FF6B1A' }],
  });
  mockMaterials.mockResolvedValue([{ id: 'm1', name: 'MDF', color: '#B98B54' }]);
});

it('says how many orders there are, not how many are on screen', async () => {
  await mount();
  expect(await screen.findByText('137 total')).toBeTruthy();
});

it('shows the client, code, stage and site on each card', async () => {
  await mount();
  expect(await screen.findByText('Verma Interiors')).toBeTruthy();
  expect(screen.getByText(/ORD-2627-0002 ·/)).toBeTruthy();
  expect(screen.getByText('Cutting')).toBeTruthy();
  expect(screen.getByText('Andheri West')).toBeTruthy();
});

it('renders sizes in the chosen unit, with thickness in millimetres', async () => {
  await mount();
  expect(await screen.findByText('8 × 4 ft')).toBeTruthy();
  expect(screen.getByText(/MDF · 18 mm/)).toBeTruthy();
});

it('opens the order that was tapped', async () => {
  await mount();
  await fireEvent.press(await screen.findByText('Verma Interiors'));
  expect(navigate).toHaveBeenCalledWith('OrderDetail', { orderId: 'o1' });
});

it('says plainly when nothing matches, and what to do', async () => {
  mockOrders.mockResolvedValue(page([], 0));
  await mount();
  expect(await screen.findByText('No orders match')).toBeTruthy();
  expect(screen.getByText('Try clearing the search or filters.')).toBeTruthy();
});

it('opens already filtered when the board hands over a stage', async () => {
  await mount({ statusId: 's1' });
  // A board column that overflows sends the reader here for the rest of it.
  expect(mockOrders.mock.calls[0][0]).toMatchObject({ statusId: 's1' });
  expect(await screen.findByText('1 filter ×')).toBeTruthy();
});

it('re-fetches when the search changes', async () => {
  await mount();
  await fireEvent.changeText(
    screen.getByPlaceholderText('Order no, client or location'),
    'verma',
  );
  await waitFor(() =>
    expect(mockOrders.mock.calls.some((c) => c[0].search === 'verma')).toBe(true),
  );
});

it('sends no search at all when the box is empty', async () => {
  await mount();
  expect(mockOrders.mock.calls[0][0].search).toBeUndefined();
});

it('re-fetches in the unit the reader picked, and remembers it', async () => {
  await mount();
  await fireEvent.press(screen.getByText('mm'));
  await waitFor(() => expect(mockOrders.mock.calls.some((c) => c[0].unit === 'MM')).toBe(true));
});

it('clears every filter in one tap', async () => {
  await mount({ statusId: 's1' });
  await fireEvent.press(await screen.findByText('1 filter ×'));
  await waitFor(() => expect(screen.queryByText('1 filter ×')).toBeNull());
});

it('offers the stages and materials to filter by', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Orders'));
  await waitFor(() => expect(mockDefaultWorkflow).toHaveBeenCalled());
  expect(mockMaterials).toHaveBeenCalled();
});

it('asks for one page at a time', async () => {
  await mount();
  expect(mockOrders.mock.calls[0][0]).toMatchObject({ page: 1, limit: 25 });
});

describe('the ways out of the list', () => {
  it('opens the board, which is this list arranged differently', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Board'));
    expect(navigate).toHaveBeenCalledWith('Board');
  });

  it('punches a new order', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Punch order'));
    expect(navigate).toHaveBeenCalledWith('PunchTab');
  });

  it('offers punching only to somebody who may punch', async () => {
    mockGranted = [];
    await mount();
    expect(screen.queryByText('Punch order')).toBeNull();
    // The board stays — looking is not punching.
    expect(screen.getByText('Board')).toBeTruthy();
  });
});
