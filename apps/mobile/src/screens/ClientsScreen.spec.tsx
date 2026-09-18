import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ClientsScreen } from './ClientsScreen';

const mockClients = jest.fn();
jest.mock('../api/client', () => ({ api: { clients: (...a: unknown[]) => mockClients(...a) } }));

const CLIENT = {
  id: 'c1',
  code: 'CLI-1',
  name: 'Verma Interiors',
  phone: '9820012345',
  company: 'Verma & Sons',
  _count: { orders: 7 },
};

const page = (rows: unknown[], total = rows.length) => ({
  data: rows,
  meta: { page: 1, pages: 1, total, limit: 25 },
});

const navigate = jest.fn();

async function mount(result: unknown = page([CLIENT], 42)) {
  mockClients.mockResolvedValue(result);
  await render(<ClientsScreen navigation={{ navigate }} />);
  await waitFor(() => expect(mockClients).toHaveBeenCalled());
}

beforeEach(() => jest.clearAllMocks());

it('says how many clients are on file, not how many are on screen', async () => {
  await mount();
  expect(await screen.findByText('42 on file')).toBeTruthy();
});

it('shows the name, code, phone and firm together', async () => {
  await mount();
  expect(await screen.findByText('Verma Interiors')).toBeTruthy();
  expect(screen.getByText('CLI-1 · 9820012345 · Verma & Sons')).toBeTruthy();
});

it('shows how much work a client has given', async () => {
  await mount();
  expect(await screen.findByText('7')).toBeTruthy();
});

it('shows zero rather than nothing for a client with no orders', async () => {
  await mount(page([{ ...CLIENT, _count: undefined }]));
  expect(await screen.findByText('0')).toBeTruthy();
});

it('opens the client that was tapped', async () => {
  await mount();
  await fireEvent.press(await screen.findByText('Verma Interiors'));
  expect(navigate).toHaveBeenCalledWith('ClientDetail', { clientId: 'c1' });
});

it('says when there are none', async () => {
  await mount(page([], 0));
  expect(await screen.findByText('No clients yet')).toBeTruthy();
});

it('searches by name, phone or code', async () => {
  await mount();
  await fireEvent.changeText(screen.getByPlaceholderText('Name, phone or code'), 'verma');
  await waitFor(() =>
    expect(mockClients.mock.calls.some((c) => c[0].search === 'verma')).toBe(true),
  );
});

it('sends no search at all when the box is empty', async () => {
  await mount();
  expect(mockClients.mock.calls[0][0].search).toBeUndefined();
});

it('says how far through a longer list the reader is', async () => {
  mockClients.mockResolvedValue({
    data: [CLIENT],
    meta: { page: 1, pages: 2, total: 42, limit: 25 },
  });
  await render(<ClientsScreen navigation={{ navigate }} />);
  expect(await screen.findByText('1 of 42 clients')).toBeTruthy();
});

it('confirms when the whole list has been seen', async () => {
  await mount(page([CLIENT], 1));
  // Without this a finished list looks like one that failed to load more.
  expect(await screen.findByText('All 1 clients')).toBeTruthy();
});

/*
 * A client could only ever appear as a side effect of punching an order.
 * That suits the floor and not an owner holding a firm's visiting card, who
 * had no way in at all.
 */
describe('adding one', () => {
  it('offers it from the header, whether or not the list is empty', async () => {
    await mount();
    await fireEvent.press(screen.getByTestId('add-client'));
    expect(navigate).toHaveBeenCalledWith('ClientNew');
  });

  it('offers it from an empty list too, instead of only explaining it', async () => {
    await mount(page([]));
    await fireEvent.press(await screen.findByTestId('empty-action'));
    expect(navigate).toHaveBeenCalledWith('ClientNew', { name: undefined });
  });

  it('carries the name that was searched for into the form', async () => {
    await mount(page([]));
    await fireEvent.changeText(screen.getByPlaceholderText('Name, phone or code'), 'Kapoor Glass');
    await fireEvent.press(await screen.findByTestId('empty-action'));
    expect(navigate).toHaveBeenCalledWith('ClientNew', { name: 'Kapoor Glass' });
  });

  it('stops telling somebody who searched that there are no clients at all', async () => {
    await mount(page([]));
    await fireEvent.changeText(screen.getByPlaceholderText('Name, phone or code'), 'Kapoor');
    expect(await screen.findByText('Nobody matches that')).toBeTruthy();
  });
});
