import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ClientsPage from './page';

const clientsCall = jest.fn();
jest.mock('@/lib/api', () => ({ api: { clients: (...a: unknown[]) => clientsCall(...a) } }));

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

jest.mock('@/components/Shell', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const CLIENT = {
  id: 'c1',
  code: 'CLI-1',
  name: 'Verma Interiors',
  phone: '9820012345',
  company: 'Verma & Sons',
  gstin: '27AAAPV1234C1ZV',
  _count: { orders: 4 },
};

const page = (items: unknown[], total = items.length) => ({
  data: items,
  meta: { page: 1, pages: 1, total, limit: 25 },
});

async function mount(items: unknown[] = [CLIENT], total?: number) {
  clientsCall.mockResolvedValue(page(items, total));
  render(<ClientsPage />);
  await waitFor(() => expect(clientsCall).toHaveBeenCalled());
}

beforeEach(() => {
  jest.clearAllMocks();
});

it('says how many are on file', async () => {
  await mount([CLIENT], 137);
  expect(await screen.findByText('137 on file')).toBeInTheDocument();
});

it('shows each client with the details somebody would search by', async () => {
  await mount();
  expect(await screen.findByText('Verma Interiors')).toBeInTheDocument();
  expect(
    screen.getByText('CLI-1 · 9820012345 · Verma & Sons · 27AAAPV1234C1ZV'),
  ).toBeInTheDocument();
});

it('leaves out the details a client does not have', async () => {
  await mount([{ ...CLIENT, phone: null, company: null, gstin: null }]);
  expect(await screen.findByText('CLI-1')).toBeInTheDocument();
});

it('says how much work each client has given the shop', async () => {
  await mount();
  expect(await screen.findByText('4 orders')).toBeInTheDocument();
});

it('counts nothing as none rather than leaving it blank', async () => {
  await mount([{ ...CLIENT, _count: undefined }]);
  expect(await screen.findByText('0 orders')).toBeInTheDocument();
});

it('opens a client', async () => {
  await mount();
  fireEvent.click(await screen.findByText('Verma Interiors'));
  expect(push).toHaveBeenCalledWith('/clients/c1');
});

it('searches by whatever is typed', async () => {
  await mount();
  fireEvent.change(screen.getByPlaceholderText('Name, phone or code'), {
    target: { value: 'verma' },
  });
  await waitFor(() =>
    expect(clientsCall).toHaveBeenLastCalledWith({ search: 'verma', page: 1, limit: 25 }),
  );
});

it('asks for everybody again when the search is cleared', async () => {
  await mount();
  const box = screen.getByPlaceholderText('Name, phone or code');
  fireEvent.change(box, { target: { value: 'verma' } });
  await waitFor(() => expect(clientsCall).toHaveBeenCalledTimes(2));
  fireEvent.change(box, { target: { value: '' } });
  await waitFor(() =>
    expect(clientsCall).toHaveBeenLastCalledWith({ search: undefined, page: 1, limit: 25 }),
  );
});

/*
 * A client could only appear as a side effect of punching an order. That is
 * fine on the floor and no use at all at a desk, where somebody has a firm's
 * card in front of them and no way to put it on file.
 */
it('offers a way to add one, rather than only explaining where they come from', async () => {
  await mount([]);
  expect(await screen.findByText('No clients yet')).toBeInTheDocument();

  // Two of them: the header's, always there, and the empty state's.
  fireEvent.click(screen.getAllByText('Add client')[1]);
  await waitFor(() => expect(push).toHaveBeenCalledWith('/clients/new'));
});

it('carries a search that found nobody into the new client form', async () => {
  await mount([]);
  fireEvent.change(screen.getByPlaceholderText('Name, phone or code'), {
    target: { value: 'Kapoor Glass' },
  });

  expect(await screen.findByText('Nobody matches that')).toBeInTheDocument();
  fireEvent.click(screen.getAllByText('Add client')[1]);
  await waitFor(() =>
    expect(push).toHaveBeenCalledWith('/clients/new?name=Kapoor%20Glass'),
  );
});
