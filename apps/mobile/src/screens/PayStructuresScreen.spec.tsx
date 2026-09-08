import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { PERMISSIONS } from '@decor/shared';
import { PayStructuresScreen } from './PayStructuresScreen';

const mockStructures = jest.fn();
const mockEmployees = jest.fn();
const mockSet = jest.fn();
jest.mock('../api/client', () => ({
  api: {
    payStructures: () => mockStructures(),
    employees: (...a: unknown[]) => mockEmployees(...a),
    setPayStructure: (...a: unknown[]) => mockSet(...a),
  },
}));

let mockPermissions: string[] = [];
jest.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ can: (p: string) => mockPermissions.includes(p) }),
}));

const CURRENT = {
  id: 's2',
  employeeId: 'e1',
  employee: { id: 'e1', code: 'EMP-0001', name: 'Ramesh' },
  kind: 'MONTHLY',
  rate: 30000,
  overtimeHourlyRate: 150,
  effectiveFrom: '2026-10-01',
  effectiveTo: null,
  createdAt: '2026-09-09T00:00:00Z',
};

const REPLACED = {
  ...CURRENT,
  id: 's1',
  rate: 26000,
  overtimeHourlyRate: null,
  effectiveFrom: '2026-01-01',
  effectiveTo: '2026-09-30',
};

const navigation = { goBack: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockPermissions = [PERMISSIONS.SALARY_VIEW, PERMISSIONS.SALARY_MANAGE];
  mockStructures.mockResolvedValue([CURRENT, REPLACED]);
  mockEmployees.mockResolvedValue({
    data: [{ id: 'e1', code: 'EMP-0001', name: 'Ramesh' }],
    meta: { page: 1, pages: 1, total: 1, limit: 200 },
  });
  mockSet.mockResolvedValue(CURRENT);
});

const mount = async () => {
  await render(<PayStructuresScreen navigation={navigation as never} />);
  await waitFor(() => expect(mockStructures).toHaveBeenCalled());
};

it('shows the arrangement that was replaced, not only the current one', async () => {
  await mount();
  // A raise is a new row, so this list is a history as much as a setting:
  // last month's payslip divided by last month's rate, and here it is.
  expect(await screen.findByText('₹30,000')).toBeTruthy();
  expect(screen.getByText('₹26,000')).toBeTruthy();
  expect(screen.getByText('Replaced')).toBeTruthy();
});

it('says what an hour of overtime is worth, where one is set', async () => {
  await mount();
  expect(await screen.findByText('OT ₹150/h')).toBeTruthy();
});

it('asks what a piece is, and only for piece work', async () => {
  await mount();
  await fireEvent.press(screen.getByTestId('add-structure'));
  // "Per piece" on a payslip tells nobody anything; "per panel" does.
  expect(screen.queryByPlaceholderText('panel')).toBeNull();

  const selects = screen.getAllByTestId('select-trigger');
  await fireEvent(selects[1], 'touchEnd');
  await fireEvent.press(await screen.findByText('Per piece'));
  expect(await screen.findByPlaceholderText('panel')).toBeTruthy();
});

it('sends the new arrangement with the day it starts', async () => {
  await mount();
  await fireEvent.press(screen.getByTestId('add-structure'));
  const selects = screen.getAllByTestId('select-trigger');
  await fireEvent(selects[0], 'touchEnd');
  await fireEvent.press(await screen.findByText('Ramesh · EMP-0001'));
  await fireEvent.changeText(screen.getByPlaceholderText('0'), '32000');
  await fireEvent.press(screen.getByText('Save'));
  await waitFor(() =>
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 'e1', kind: 'MONTHLY', rate: 32000 }),
    ),
  );
});

it('offers setting pay only to whoever may', async () => {
  mockPermissions = [PERMISSIONS.SALARY_VIEW];
  await mount();
  expect(screen.queryByTestId('add-structure')).toBeNull();
});
