import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ReportRequestScreen } from './ReportRequestScreen';

const mockRequestReport = jest.fn();
const mockClients = jest.fn();
jest.mock('../api/client', () => ({
  api: {
    requestReport: (...a: unknown[]) => mockRequestReport(...a),
    clients: (...a: unknown[]) => mockClients(...a),
  },
}));

const navigation = { goBack: jest.fn(), navigate: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockRequestReport.mockResolvedValue({ id: 'r1' });
  mockClients.mockResolvedValue({ data: [] });
  // Fixed, so the period the screen offers is the same one every run.
  jest.useFakeTimers({ now: new Date('2026-09-09T10:00:00'), doNotFake: ['setInterval', 'setTimeout'] });
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
  const CLIENTS = {
    data: [
      { id: 'c1', name: 'Sharma Interiors', code: 'CL-1', phone: '9876543210' },
      { id: 'c2', name: 'Bhatia Residence', code: 'CL-2', phone: '9876500000' },
    ],
  };

  beforeEach(() => {
    mockClients.mockResolvedValue(CLIENTS);
  });

  /** The report Select is the first of the two on the screen. */
  async function pickStatement() {
    render(<ReportRequestScreen navigation={navigation} />);
    await waitFor(() => expect(screen.getAllByTestId('select-trigger').length).toBeGreaterThan(0));

    fireEvent(screen.getAllByTestId('select-trigger')[0], 'touchEnd');
    await waitFor(() => expect(screen.getByText('Client statement')).toBeTruthy());
    fireEvent.press(screen.getByText('Client statement'));
  }

  it('asks for a client and refuses until one is chosen', async () => {
    await pickStatement();

    await waitFor(() => expect(screen.getByText('Choose a client')).toBeTruthy());
    expect(screen.getByText(/is about one client, so it needs one/)).toBeTruthy();
  });

  // Nothing else should go looking up the client list.
  it('does not fetch clients for a report that has no subject', async () => {
    render(<ReportRequestScreen navigation={navigation} />);
    await waitFor(() => expect(screen.getByText('Ask for it')).toBeTruthy());

    expect(mockClients).not.toHaveBeenCalled();
  });

  it('sends the chosen client with the request', async () => {
    await pickStatement();
    await waitFor(() => expect(screen.getByText('Choose a client')).toBeTruthy());

    fireEvent.press(screen.getByText('Choose a client'));
    await waitFor(() => expect(screen.getByText('Sharma Interiors')).toBeTruthy());
    fireEvent.press(screen.getByText('Sharma Interiors'));

    await waitFor(() => expect(screen.getByText('Ask for it')).toBeTruthy());
    fireEvent.press(screen.getByText('Ask for it'));

    await waitFor(() =>
      expect(mockRequestReport).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'CLIENT_STATEMENT', clientId: 'c1' }),
      ),
    );
  });
});
