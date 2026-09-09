import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { PERMISSIONS, shiftDay, today } from '@fas/shared';
import { AttendanceScreen } from './AttendanceScreen';

const mockDay = jest.fn();
const mockMark = jest.fn();
jest.mock('../api/client', () => ({
  api: {
    attendanceDay: (...a: unknown[]) => mockDay(...a),
    markAttendance: (...a: unknown[]) => mockMark(...a),
  },
}));

let mockPermissions: string[] = [];
jest.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ can: (p: string) => mockPermissions.includes(p) }),
}));

const employee = (id: string, name: string) => ({
  id,
  code: `EMP-000${id.slice(1)}`,
  name,
  designation: 'Operator',
  department: 'Production',
  status: 'ACTIVE',
});

const day = (rows: unknown[]) => ({ date: '2026-09-09', rows });

const unmarked = (id: string, name: string) => ({
  employee: employee(id, name),
  marked: false,
  mark: null,
  overtimeMinutes: 0,
});

const navigation = { goBack: jest.fn(), navigate: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockPermissions = [PERMISSIONS.ATTENDANCE_VIEW, PERMISSIONS.ATTENDANCE_MARK];
  mockDay.mockResolvedValue(day([unmarked('e1', 'Ramesh'), unmarked('e2', 'Iqbal')]));
  mockMark.mockResolvedValue(day([]));
});

const mount = async () => {
  await render(<AttendanceScreen navigation={navigation as never} />);
  await waitFor(() => expect(mockDay).toHaveBeenCalled());
};

it('lists everybody, including whoever has not been marked', async () => {
  await mount();
  // A register showing only what was entered would make a morning nobody
  // marked look like a morning nobody came in.
  expect(await screen.findByText('Ramesh')).toBeTruthy();
  expect(screen.getByText('2 still to mark')).toBeTruthy();
});

it('says so plainly once everybody has a mark', async () => {
  mockDay.mockResolvedValue(
    day([{ ...unmarked('e1', 'Ramesh'), marked: true, mark: 'PRESENT' }]),
  );
  await mount();
  expect(await screen.findByText('Everybody marked')).toBeTruthy();
});

it('saves the whole register in one go', async () => {
  await mount();
  await fireEvent.press(screen.getAllByText('In')[0]);
  await fireEvent.press(screen.getAllByText('Absent')[1]);
  await fireEvent.press(screen.getByText('Save the register'));
  // Saving a row at a time would leave half a register on a bad morning.
  await waitFor(() => expect(mockMark).toHaveBeenCalledTimes(1));
  expect(mockMark).toHaveBeenCalledWith(today(), [
    { employeeId: 'e1', mark: 'PRESENT' },
    { employeeId: 'e2', mark: 'ABSENT' },
  ]);
});

it('marks everybody left in one tap', async () => {
  await mount();
  await fireEvent.press(screen.getByTestId('all-off'));
  await fireEvent.press(screen.getByText('Save the register'));
  await waitFor(() =>
    expect(mockMark).toHaveBeenCalledWith(today(), [
      { employeeId: 'e1', mark: 'WEEKLY_OFF' },
      { employeeId: 'e2', mark: 'WEEKLY_OFF' },
    ]),
  );
});

it('does not overwrite a mark somebody already chose', async () => {
  await mount();
  await fireEvent.press(screen.getAllByText('Absent')[0]);
  // "Mark everybody left" means the ones left, not the ones already done.
  await fireEvent.press(screen.getByTestId('all-off'));
  await fireEvent.press(screen.getByText('Save the register'));
  await waitFor(() =>
    expect(mockMark).toHaveBeenCalledWith(today(), [
      { employeeId: 'e1', mark: 'ABSENT' },
      { employeeId: 'e2', mark: 'WEEKLY_OFF' },
    ]),
  );
});

it('shows yesterday and tomorrow without typing a date', async () => {
  await mount();
  await fireEvent.press(screen.getByTestId('next-day'));
  await waitFor(() => expect(mockDay).toHaveBeenLastCalledWith(shiftDay(today(), 1)));
});

it('offers no marking at all to somebody who may only look', async () => {
  mockPermissions = [PERMISSIONS.ATTENDANCE_VIEW];
  await mount();
  expect(screen.queryByText('Save the register')).toBeNull();
  expect(screen.queryByText('Mark everybody left')).toBeNull();
});

it('opens on the day the shop is having, not on UTC', async () => {
  // Read as UTC, a shop in India opening the register before half past five
  // in the morning would be shown yesterday.
  await mount();
  expect(mockDay).toHaveBeenCalledWith(today());
});
