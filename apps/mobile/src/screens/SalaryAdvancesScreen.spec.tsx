import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { PERMISSIONS } from '@decor/shared';
import { SalaryAdvancesScreen, outstanding } from './SalaryAdvancesScreen';

const mockAdvances = jest.fn();
const mockEmployees = jest.fn();
const mockGive = jest.fn();
jest.mock('../api/client', () => ({
  api: {
    salaryAdvances: () => mockAdvances(),
    employees: (...a: unknown[]) => mockEmployees(...a),
    giveSalaryAdvance: (...a: unknown[]) => mockGive(...a),
  },
}));

let mockPermissions: string[] = [];
jest.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ can: (p: string) => mockPermissions.includes(p) }),
}));

const ADVANCE = {
  id: 'a1',
  employeeId: 'e1',
  employee: { id: 'e1', code: 'EMP-0001', name: 'Ramesh' },
  amount: 5000,
  givenOn: '2026-09-05',
  mode: 'CASH',
  recoveredAmount: 2000,
  note: 'For the festival',
  createdAt: '2026-09-05T00:00:00Z',
};

const navigation = { goBack: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockPermissions = [PERMISSIONS.SALARY_VIEW, PERMISSIONS.SALARY_MANAGE];
  mockAdvances.mockResolvedValue([ADVANCE]);
  mockEmployees.mockResolvedValue({
    data: [{ id: 'e1', code: 'EMP-0001', name: 'Ramesh' }],
    meta: { page: 1, pages: 1, total: 1, limit: 200 },
  });
  mockGive.mockResolvedValue(ADVANCE);
});

const mount = async () => {
  await render(<SalaryAdvancesScreen navigation={navigation as never} />);
  await waitFor(() => expect(mockAdvances).toHaveBeenCalled());
};

it('leads with what is still to come back', async () => {
  await mount();
  expect(await screen.findByText('₹3,000')).toBeTruthy();
  expect(screen.getByText('₹3,000 left')).toBeTruthy();
});

it('works out what is left on one', () => {
  expect(outstanding({ amount: 5000, recoveredAmount: 2000 } as never)).toBe(3000);
  // Never negative, however the recovery was recorded.
  expect(outstanding({ amount: 5000, recoveredAmount: 6000 } as never)).toBe(0);
});

it('says when one has been paid back', async () => {
  mockAdvances.mockResolvedValue([{ ...ADVANCE, recoveredAmount: 5000 }]);
  await mount();
  expect(await screen.findByText('Recovered')).toBeTruthy();
});

it('gives one, saying it leaves the drawer today', async () => {
  await mount();
  await fireEvent.press(screen.getByTestId('give-advance'));
  expect(await screen.findByText(/leaves the drawer today/)).toBeTruthy();

  const selects = screen.getAllByTestId('select-trigger');
  await fireEvent(selects[0], 'touchEnd');
  await fireEvent.press(await screen.findByText('Ramesh · EMP-0001'));
  await fireEvent.changeText(screen.getByPlaceholderText('0'), '4000');
  await fireEvent.press(screen.getByText('Give it'));

  await waitFor(() =>
    expect(mockGive).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 'e1', amount: 4000, mode: 'CASH' }),
    ),
  );
});

it('offers giving one only to whoever may', async () => {
  mockPermissions = [PERMISSIONS.SALARY_VIEW];
  await mount();
  expect(screen.queryByTestId('give-advance')).toBeNull();
});
