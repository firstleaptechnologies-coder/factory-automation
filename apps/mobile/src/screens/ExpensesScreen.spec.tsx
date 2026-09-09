import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { PERMISSIONS } from '@fas/shared';
import { ExpensesScreen } from './ExpensesScreen';

const mockExpenses = jest.fn();
const mockOptions = jest.fn();
jest.mock('../api/client', () => ({
  api: {
    expenses: (...a: unknown[]) => mockExpenses(...a),
    expenseOptions: () => mockOptions(),
  },
}));

let mockPermissions: string[] = [];
jest.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ can: (p: string) => mockPermissions.includes(p) }),
}));

const ROW = {
  id: 'e1',
  date: '2026-09-08',
  description: 'Router bits',
  amount: '4500',
  paymentType: 'Cash',
  doneBy: 'Nakul',
  toName: 'Sharma Tools',
  vendor: 'Self',
  spentType: 'Tooling',
  itcEligible: false,
  createdAt: '2026-09-08T10:00:00Z',
  updatedAt: '2026-09-08T10:00:00Z',
};

const page = (rows: unknown[], total = 4500) => ({
  total,
  data: rows,
  meta: { page: 1, pages: 1, total: rows.length, limit: 25 },
});

const navigation = { goBack: jest.fn(), navigate: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockPermissions = [PERMISSIONS.EXPENSE_VIEW, PERMISSIONS.EXPENSE_MANAGE];
  mockExpenses.mockResolvedValue(page([ROW]));
  mockOptions.mockResolvedValue({
    PAYMENT_TYPE: ['Cash', 'UPI'],
    DONE_BY: ['Nakul'],
    VENDOR: ['Self'],
    SPENT_TYPE: ['Tooling', 'Rent'],
    TO_NAME: ['Sharma Tools'],
  });
});

const mount = async () => {
  await render(<ExpensesScreen navigation={navigation as never} />);
  await waitFor(() => expect(mockExpenses).toHaveBeenCalled());
};

it('totals the whole filtered set, not the page on screen', async () => {
  mockExpenses.mockResolvedValue(page([ROW], 128000));
  await mount();
  // The hero answers "what has this shop spent", which a page sum would not.
  expect(await screen.findByText('₹1.28 L')).toBeTruthy();
});

it('says what each expense was, and on whose account', async () => {
  await mount();
  expect(screen.getByText('Router bits')).toBeTruthy();
  expect(screen.getByText(/Tooling · Cash · Nakul/)).toBeTruthy();
});

it('offers the shop its own categories to filter by', async () => {
  await mount();
  await fireEvent.press(screen.getByTestId('filter-button'));
  // Not a fixed list in the app: a category added this morning filters today.
  expect(await screen.findByText('Rent')).toBeTruthy();
});

it('asks the server for the filter that was applied', async () => {
  await mount();
  await fireEvent.press(screen.getByTestId('filter-button'));
  await fireEvent.press(await screen.findByText('Rent'));
  await fireEvent.press(screen.getByText('Apply 1 filter'));
  await waitFor(() =>
    expect(mockExpenses).toHaveBeenLastCalledWith(
      expect.objectContaining({ spentType: 'Rent' }),
    ),
  );
});

it('searches what somebody would actually type', async () => {
  await mount();
  await fireEvent.changeText(
    screen.getByPlaceholderText('What it was, or who it went to'),
    'diesel',
  );
  await waitFor(() =>
    expect(mockExpenses).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'diesel' }),
    ),
  );
});

it('offers to record one only to somebody who may', async () => {
  mockPermissions = [PERMISSIONS.EXPENSE_VIEW];
  await mount();
  expect(screen.queryByTestId('add-expense')).toBeNull();
});

it('opens the form when there is nothing yet and the person may add one', async () => {
  mockExpenses.mockResolvedValue(page([], 0));
  await mount();
  expect(screen.getByText('Nothing recorded yet')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('add-expense'));
  expect(navigation.navigate).toHaveBeenCalledWith('ExpenseForm', {});
});

it('opens one expense from the list', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Router bits'));
  expect(navigation.navigate).toHaveBeenCalledWith('ExpenseDetail', { id: 'e1' });
});
