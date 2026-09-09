import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ReportRequestScreen } from './ReportRequestScreen';

const mockRequestReport = jest.fn();
jest.mock('../api/client', () => ({
  api: { requestReport: (...a: unknown[]) => mockRequestReport(...a) },
}));

const navigation = { goBack: jest.fn(), navigate: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockRequestReport.mockResolvedValue({ id: 'r1' });
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
