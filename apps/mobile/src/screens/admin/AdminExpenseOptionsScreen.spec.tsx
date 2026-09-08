import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AdminExpenseOptionsScreen } from './AdminExpenseOptionsScreen';

const mockOptions = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
jest.mock('../../api/client', () => ({
  api: {
    allExpenseOptions: (...a: unknown[]) => mockOptions(...a),
    createExpenseOption: (...a: unknown[]) => mockCreate(...a),
    updateExpenseOption: (...a: unknown[]) => mockUpdate(...a),
    deleteExpenseOption: (...a: unknown[]) => mockDelete(...a),
  },
}));

const ROWS = [
  { id: 'o1', field: 'SPENT_TYPE', label: 'Rent', isActive: true, sortOrder: 10 },
  { id: 'o2', field: 'SPENT_TYPE', label: 'Diesel', isActive: false, sortOrder: 20 },
  { id: 'o3', field: 'PAYMENT_TYPE', label: 'Cash', account: 'CASH', isActive: true, sortOrder: 10 },
  { id: 'o4', field: 'PAYMENT_TYPE', label: 'UPI', account: 'BANK', isActive: true, sortOrder: 20 },
];

const navigation = { goBack: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockOptions.mockResolvedValue(ROWS);
  mockCreate.mockResolvedValue({ id: 'o9' });
  mockUpdate.mockResolvedValue({ id: 'o2' });
  mockDelete.mockResolvedValue({ id: 'o1' });
});

const mount = async () => {
  await render(<AdminExpenseOptionsScreen navigation={navigation as never} />);
  await waitFor(() => expect(mockOptions).toHaveBeenCalled());
};

it('shows one list at a time, starting with the categories', async () => {
  await mount();
  expect(await screen.findByText('Rent')).toBeTruthy();
  expect(screen.queryByText('UPI')).toBeNull();
});

it('switches to another list', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Paid by'));
  expect(await screen.findByText('UPI')).toBeTruthy();
});

it('says which drawer each way of paying comes out of', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Paid by'));
  // The shop names its own payment types, so only it can say which are cash —
  // and cash in hand is wrong the moment this is.
  expect(await screen.findByText('Comes out of the drawer')).toBeTruthy();
  expect(screen.getByText('Comes out of the bank')).toBeTruthy();
});

it('marks a hidden option rather than dropping it from the screen', async () => {
  await mount();
  // Expenses store the label, so a hidden option is still on last March's rows.
  expect(await screen.findByText('Diesel')).toBeTruthy();
  expect(screen.getByText('Hidden')).toBeTruthy();
});

it('hides an option instead of deleting it', async () => {
  await mount();
  await fireEvent.press(screen.getAllByText('Hide')[0]);
  await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('o1'));
});

it('brings a hidden one back', async () => {
  await mount();
  await fireEvent.press(await screen.findByText('Show'));
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('o2', { isActive: true }));
});

it('adds a category without asking which account it comes out of', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Add to category'));
  await fireEvent.changeText(await screen.findByDisplayValue(''), 'Freight');
  await fireEvent.press(screen.getByText('Add'));
  await waitFor(() =>
    expect(mockCreate).toHaveBeenCalledWith({ field: 'SPENT_TYPE', label: 'Freight' }),
  );
});

it('asks which account a new way of paying comes out of', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Paid by'));
  await fireEvent.press(screen.getByText('Add to paid by'));
  await fireEvent.changeText(await screen.findByDisplayValue(''), 'Owner card');
  await fireEvent.press(screen.getByText('Add'));
  await waitFor(() =>
    expect(mockCreate).toHaveBeenCalledWith({
      field: 'PAYMENT_TYPE',
      label: 'Owner card',
      account: 'BANK',
    }),
  );
});
