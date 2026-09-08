import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { EstimatesScreen } from './EstimatesScreen';

const mockEstimates = jest.fn();
jest.mock('../api/client', () => ({
  api: { estimates: (...a: unknown[]) => mockEstimates(...a) },
}));

const ESTIMATE = {
  id: 'e1',
  code: 'EST-1',
  status: 'SENT',
  issuedOn: '2026-09-02T10:00:00Z',
  grandTotal: '59000',
  clientName: null,
  client: { name: 'Verma Interiors' },
  items: [{ id: 'i1' }, { id: 'i2' }],
};

const page = (rows: unknown[], total = rows.length, pages = 1) => ({
  data: rows,
  meta: { page: 1, pages, total, limit: 25 },
});

jest.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ can: () => true, user: { name: 'Nakul' } }),
}));

const navigate = jest.fn();

async function mount(result: unknown = page([ESTIMATE], 12)) {
  mockEstimates.mockResolvedValue(result);
  await render(<EstimatesScreen navigation={{ navigate }} />);
  await waitFor(() => expect(mockEstimates).toHaveBeenCalled());
}

beforeEach(() => jest.clearAllMocks());

it('says how many have been quoted', async () => {
  await mount();
  expect(await screen.findByText('12 quoted')).toBeTruthy();
});

it('shows the client, number, date, status and total', async () => {
  await mount();
  expect(await screen.findByText('Verma Interiors')).toBeTruthy();
  expect(screen.getByText(/EST-1 ·/)).toBeTruthy();
  expect(screen.getByText('SENT')).toBeTruthy();
  expect(screen.getByText('₹59,000')).toBeTruthy();
});

it('counts the lines, in the singular and the plural', async () => {
  await mount();
  expect(await screen.findByText('2 lines')).toBeTruthy();
  await mount(page([{ ...ESTIMATE, items: [{ id: 'i1' }] }]));
  expect(await screen.findByText('1 line')).toBeTruthy();
});

it('falls back to the typed name for a walk-in with no client record', async () => {
  await mount(page([{ ...ESTIMATE, client: null, clientName: 'Walk-in' }]));
  expect(await screen.findByText('Walk-in')).toBeTruthy();
});

it('says "Unnamed" rather than showing a blank card', async () => {
  await mount(page([{ ...ESTIMATE, client: null, clientName: null }]));
  expect(await screen.findByText('Unnamed')).toBeTruthy();
});

it('opens the estimate that was tapped', async () => {
  await mount();
  await fireEvent.press(await screen.findByText('Verma Interiors'));
  expect(navigate).toHaveBeenCalledWith('EstimateDetail', { estimateId: 'e1' });
});

it('starts a new estimate with no id, so the form knows it is new', async () => {
  await mount();
  await fireEvent.press(screen.getByText('New quote'));
  expect(navigate).toHaveBeenCalledWith('EstimateEdit', {});
});

it('says when there are none, and what to do', async () => {
  await mount(page([], 0));
  expect(await screen.findByText('No quotes yet')).toBeTruthy();
  expect(screen.getByText('Quote a job before it becomes an order.')).toBeTruthy();
});

it('searches by number or client', async () => {
  await mount();
  await fireEvent.changeText(
    screen.getByPlaceholderText('Estimate number or client'),
    'verma',
  );
  await waitFor(() =>
    expect(mockEstimates.mock.calls.some((c) => c[0].search === 'verma')).toBe(true),
  );
});

it('filters to one status', async () => {
  await mount();
  await fireEvent.press(screen.getByTestId('filter-button'));
  await fireEvent(await screen.findByText('ACCEPTED'), 'touchEnd');
  await fireEvent.press(screen.getByText('Apply 1 filter'));
  await waitFor(() =>
    expect(mockEstimates.mock.calls.some((c) => c[0].status === 'ACCEPTED')).toBe(true),
  );
});

it('says how far through a longer list the reader is', async () => {
  await mount(page([ESTIMATE], 12, 2));
  expect(await screen.findByText('1 of 12 estimates')).toBeTruthy();
});
