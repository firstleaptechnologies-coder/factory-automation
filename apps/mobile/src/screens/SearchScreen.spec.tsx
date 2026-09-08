import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SearchScreen } from './SearchScreen';

const mockOrders = jest.fn();
const mockLeads = jest.fn();
const mockSearchClients = jest.fn();
jest.mock('../api/client', () => ({
  api: {
    orders: (...a: unknown[]) => mockOrders(...a),
    leads: (...a: unknown[]) => mockLeads(...a),
    searchClients: (...a: unknown[]) => mockSearchClients(...a),
  },
}));

const ORDER = {
  id: 'o1',
  code: 'ORD-1',
  location: 'Andheri',
  client: { name: 'Verma Interiors' },
  status: { name: 'Cutting', color: '#FF6B1A' },
};
const LEAD = {
  id: 'l1',
  code: 'LEAD-1',
  title: 'Kitchen jali',
  contactName: 'Verma',
  status: { name: 'Quoted', color: '#D29922' },
};
const CLIENT = { id: 'c1', code: 'CLI-1', name: 'Verma Interiors', phone: '9820012345' };

const navigate = jest.fn();

async function mount() {
  await render(<SearchScreen navigation={{ navigate }} />);
}

async function type(term: string) {
  await fireEvent.changeText(
    screen.getByPlaceholderText('Order, client, phone, enquiry…'),
    term,
  );
  // Debounced so a fast typist does not fire a request per keystroke.
  await act(async () => {
    jest.advanceTimersByTime(300);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockOrders.mockResolvedValue({ data: [ORDER] });
  mockLeads.mockResolvedValue({ data: [LEAD] });
  mockSearchClients.mockResolvedValue([CLIENT]);
});
afterEach(() => jest.useRealTimers());

it('invites a search rather than showing an empty list', async () => {
  await mount();
  expect(screen.getByText('Search everything')).toBeTruthy();
});

it('does not search until something is typed', async () => {
  await mount();
  await act(async () => {
    jest.advanceTimersByTime(500);
  });
  expect(mockOrders).not.toHaveBeenCalled();
});

it('searches orders, leads and clients at once', async () => {
  await mount();
  await type('verma');
  await waitFor(() => expect(mockOrders).toHaveBeenCalled());
  expect(mockLeads).toHaveBeenCalled();
  expect(mockSearchClients).toHaveBeenCalledWith('verma');
});

it('groups the results by what they are', async () => {
  await mount();
  await type('verma');
  // "Clients" is also a scope chip, so the group heading is the second one.
  expect((await screen.findAllByText('Clients')).length).toBe(2);
  expect(screen.getAllByText('Orders')).toHaveLength(2);
  expect(screen.getAllByText('Leads')).toHaveLength(2);
});

it('opens whichever result was tapped', async () => {
  await mount();
  await type('verma');
  await fireEvent.press(await screen.findByText('CLI-1'));
  expect(navigate).toHaveBeenCalledWith('ClientDetail', { clientId: 'c1' });
});

it('says plainly when nothing matches, quoting the term', async () => {
  mockOrders.mockResolvedValue({ data: [] });
  mockLeads.mockResolvedValue({ data: [] });
  mockSearchClients.mockResolvedValue([]);
  await mount();
  await type('zzz');
  expect(await screen.findByText('Nothing found')).toBeTruthy();
  expect(screen.getByText('No match for “zzz”.')).toBeTruthy();
});

it('does not throw a dialog at someone mid-typing when a search fails', async () => {
  mockOrders.mockRejectedValue(new Error('offline'));
  await mount();
  await type('verma');
  await act(async () => {
    jest.advanceTimersByTime(50);
  });
  expect(screen.getByPlaceholderText('Order, client, phone, enquiry…')).toBeTruthy();
});

it('clears the results when the box is emptied', async () => {
  await mount();
  await type('verma');
  await waitFor(() => expect(screen.getAllByText('Clients')).toHaveLength(2));
  await type('');
  expect(screen.getByText('Search everything')).toBeTruthy();
});

it('narrows to one kind of thing when a scope is chosen', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Clients'));
  await type('verma');
  await waitFor(() => expect(mockSearchClients).toHaveBeenCalled());
  expect(mockOrders).not.toHaveBeenCalled();
  expect(mockLeads).not.toHaveBeenCalled();
});
