import { Linking } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ReportsScreen } from './ReportsScreen';

const mockReports = jest.fn();
jest.mock('../api/client', () => ({
  api: {
    reports: (...a: unknown[]) => mockReports(...a),
    reportDownloadUrl: (id: string) => `http://localhost:3001/api/reports/${id}/download`,
  },
}));

let mockAllowed = ['report.view', 'report.run'];
jest.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ can: (permission: string) => mockAllowed.includes(permission) }),
}));

const navigation = { goBack: jest.fn(), navigate: jest.fn() };

const row = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  kind: 'PAYOUT_LEDGER',
  format: 'XLSX',
  status: 'READY',
  fromDate: '2026-04-01',
  toDate: '2027-03-31',
  rowCount: 7,
  error: null,
  createdAt: '2026-09-09',
  requestedBy: { id: 'u1', name: 'Administrator' },
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockAllowed = ['report.view', 'report.run'];
  mockReports.mockResolvedValue([row()]);
});

it('names a report by its label rather than its code', async () => {
  render(<ReportsScreen navigation={navigation} />);

  await waitFor(() => expect(screen.getByText('Payout ledger')).toBeTruthy());
  expect(screen.getByText(/7 rows/)).toBeTruthy();
});

it('opens the file when it is ready', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
  render(<ReportsScreen navigation={navigation} />);

  await waitFor(() => expect(screen.getByText('Download')).toBeTruthy());
  fireEvent.press(screen.getByText('Download'));

  expect(open).toHaveBeenCalledWith('http://localhost:3001/api/reports/r1/download');
});

it('offers nothing to download while it is still building', async () => {
  mockReports.mockResolvedValue([row({ status: 'GENERATING' })]);
  render(<ReportsScreen navigation={navigation} />);

  await waitFor(() => expect(screen.getByText('Building')).toBeTruthy());
  expect(screen.queryByText('Download')).toBeNull();
});

// Leaving somebody looking at a row that stopped moving, with no reason, is
// the whole failure this avoids.
it('says why a report failed', async () => {
  mockReports.mockResolvedValue([
    row({ status: 'FAILED', error: 'Database `bigshop` does not exist' }),
  ]);
  render(<ReportsScreen navigation={navigation} />);

  await waitFor(() => expect(screen.getByText(/does not exist/)).toBeTruthy());
});

it('hides asking for one from somebody who may only read them', async () => {
  mockAllowed = ['report.view'];
  render(<ReportsScreen navigation={navigation} />);

  await waitFor(() => expect(screen.getByText('Payout ledger')).toBeTruthy());
  expect(screen.queryByText('Ask for a report')).toBeNull();
});

it('goes to the request screen', async () => {
  render(<ReportsScreen navigation={navigation} />);

  await waitFor(() => expect(screen.getByText('Ask for a report')).toBeTruthy());
  fireEvent.press(screen.getByText('Ask for a report'));

  expect(navigation.navigate).toHaveBeenCalledWith('ReportRequest');
});

// A phone in a pocket must not be kept awake looking at rows that have
// stopped changing. Asserted on the timer itself rather than by running the
// clock: advancing fake timers under a component that polls hangs the run.
it('sets no timer when nothing is working', async () => {
  const timer = jest.spyOn(global, 'setInterval');
  mockReports.mockResolvedValue([row({ status: 'READY' })]);

  render(<ReportsScreen navigation={navigation} />);
  await waitFor(() => expect(screen.getByText('Payout ledger')).toBeTruthy());

  // Filtered to our own interval: waitFor sets one of its own at 50ms.
  const ours = timer.mock.calls.filter(([, ms]) => ms === 4000);
  expect(ours).toHaveLength(0);
  timer.mockRestore();
});

it('sets one while a report is still building', async () => {
  const timer = jest.spyOn(global, 'setInterval');
  mockReports.mockResolvedValue([row({ status: 'QUEUED' })]);

  render(<ReportsScreen navigation={navigation} />);
  await waitFor(() => expect(screen.getByText('Waiting')).toBeTruthy());

  expect(timer).toHaveBeenCalledWith(expect.any(Function), 4000);
  timer.mockRestore();
});

it('says the shop has asked for nothing yet', async () => {
  mockReports.mockResolvedValue([]);
  render(<ReportsScreen navigation={navigation} />);

  await waitFor(() => expect(screen.getByText('Nothing asked for yet')).toBeTruthy());
});
