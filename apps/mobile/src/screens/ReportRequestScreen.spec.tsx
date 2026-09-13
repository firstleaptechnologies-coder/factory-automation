import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ReportRequestScreen } from './ReportRequestScreen';

const mockRequestReport = jest.fn();
const mockSearchClients = jest.fn();
jest.mock('../api/client', () => ({
  api: {
    requestReport: (...a: unknown[]) => mockRequestReport(...a),
    searchClients: (...a: unknown[]) => mockSearchClients(...a),
  },
}));

const navigation = { goBack: jest.fn(), navigate: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockRequestReport.mockResolvedValue({ id: 'r1' });
  mockSearchClients.mockResolvedValue([]);
  /*
   * Only the clock is fixed, so the period the screen offers is the same one
   * every run. Everything that makes work happen is left real — faking
   * `setImmediate` and `queueMicrotask` strands React's own flush, so a state
   * update from a resolved promise never reaches the tree and a search that
   * did run looks like one that returned nothing.
   */
  jest.useFakeTimers({
    now: new Date('2026-09-09T10:00:00'),
    doNotFake: ['setInterval', 'setTimeout', 'setImmediate', 'queueMicrotask', 'nextTick'],
  });
});

afterEach(() => {
  jest.useRealTimers();
});

it('describes the report that is selected', async () => {
  render(<ReportRequestScreen navigation={navigation} />);

  await waitFor(() =>
    expect(screen.getByText(/Taxable value and tax by slab/)).toBeTruthy(),
  );
});

it('shows the days the chosen period works out to', async () => {
  render(<ReportRequestScreen navigation={navigation} />);

  await waitFor(() => expect(screen.getByText('2026-09-01 to 2026-09-30')).toBeTruthy());
});

it('asks for the report over the period and goes back', async () => {
  render(<ReportRequestScreen navigation={navigation} />);

  await waitFor(() => expect(screen.getByText('Ask for it')).toBeTruthy());
  fireEvent.press(screen.getByText('Ask for it'));

  await waitFor(() =>
    expect(mockRequestReport).toHaveBeenCalledWith({
      kind: 'GST_SUMMARY',
      from: '2026-09-01',
      to: '2026-09-30',
    }),
  );
  expect(navigation.goBack).toHaveBeenCalled();
});

it('shows what the API said when it refuses', async () => {
  mockRequestReport.mockRejectedValue(new Error('Salary register is still to be written.'));
  render(<ReportRequestScreen navigation={navigation} />);

  await waitFor(() => expect(screen.getByText('Ask for it')).toBeTruthy());
  fireEvent.press(screen.getByText('Ask for it'));

  await waitFor(() =>
    expect(screen.getByText('Salary register is still to be written.')).toBeTruthy(),
  );
  expect(navigation.goBack).not.toHaveBeenCalled();
});

describe('a report about one client', () => {
  const CLIENTS = [
    { id: 'c1', name: 'Sharma Interiors', code: 'CL-1', phone: '9876543210' },
    { id: 'c2', name: 'Bhatia Residence', code: 'CL-2', phone: '9876500000' },
  ];

  beforeEach(() => {
    mockSearchClients.mockResolvedValue(CLIENTS);
  });

  /** The report Select is the first of the two on the screen. */
  async function pickStatement() {
    await render(<ReportRequestScreen navigation={navigation} />);
    await waitFor(() => expect(screen.getAllByTestId('select-trigger').length).toBeGreaterThan(0));

    await fireEvent(screen.getAllByTestId('select-trigger')[0], 'touchEnd');
    await waitFor(() => expect(screen.getByText('Client statement')).toBeTruthy());
    await fireEvent.press(screen.getByText('Client statement'));
  }

  it('asks for a client and refuses until one is chosen', async () => {
    await pickStatement();

    await waitFor(() => expect(screen.getByLabelText('Search existing clients')).toBeTruthy());
    expect(screen.getByText(/is about one client, so it needs one/)).toBeTruthy();
  });

  // Nothing goes looking up the client list until somebody types in the sheet.
  it('does not fetch clients for a report that has no subject', async () => {
    render(<ReportRequestScreen navigation={navigation} />);
    await waitFor(() => expect(screen.getByText('Ask for it')).toBeTruthy());

    expect(mockSearchClients).not.toHaveBeenCalled();
  });

  /*
   * Search, and only search.
   *
   * The picker is the one the punch and quote screens use, with its add-a-new
   * half turned off: a statement for a client the shop has never traded with
   * would be an empty report about a client created to read it.
   */
  it('offers no way to create a client from here', async () => {
    await pickStatement();
    await waitFor(() => expect(screen.getByLabelText('Search existing clients')).toBeTruthy());

    expect(screen.queryByText('or add a new one')).toBeNull();
    expect(screen.queryByPlaceholderText('Who is it for?')).toBeNull();
  });

  it('sends the chosen client with the request', async () => {
    await pickStatement();
    await waitFor(() => expect(screen.getByLabelText('Search existing clients')).toBeTruthy());

    await fireEvent.press(screen.getByLabelText('Search existing clients'));
    await fireEvent.changeText(await screen.findByPlaceholderText('Type to search…'), 'sharma');
    await fireEvent.press(await screen.findByText('Sharma Interiors'));

    await waitFor(() => expect(screen.getByText('Ask for it')).toBeTruthy());
    fireEvent.press(screen.getByText('Ask for it'));

    await waitFor(() =>
      expect(mockRequestReport).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'CLIENT_STATEMENT', clientId: 'c1' }),
      ),
    );
  });
});
