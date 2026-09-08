import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ExpenseFormScreen } from './ExpenseFormScreen';

const mockOptions = jest.fn();
const mockExpense = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
jest.mock('../api/client', () => ({
  api: {
    expenseOptions: () => mockOptions(),
    expense: (...a: unknown[]) => mockExpense(...a),
    createExpense: (...a: unknown[]) => mockCreate(...a),
    updateExpense: (...a: unknown[]) => mockUpdate(...a),
  },
}));

const OPTIONS = {
  PAYMENT_TYPE: ['Cash', 'UPI'],
  DONE_BY: ['Nakul'],
  VENDOR: ['Self'],
  SPENT_TYPE: ['Tooling'],
  TO_NAME: ['Sharma Tools'],
};

const navigation = { goBack: jest.fn(), replace: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockOptions.mockResolvedValue(OPTIONS);
  mockCreate.mockResolvedValue({ id: 'e9' });
  mockUpdate.mockResolvedValue({ id: 'e1' });
});

const mount = async (params: Record<string, unknown> = {}) => {
  await render(
    <ExpenseFormScreen navigation={navigation as never} route={{ params } as never} />,
  );
  await waitFor(() => expect(mockOptions).toHaveBeenCalled());
};

/**
 * Fills in the five dropdowns, in the order the form asks for them.
 *
 * The well opens on touchEnd rather than a press: it is the same field the
 * rest of the app uses, not a platform picker.
 */
async function pickAll() {
  const wanted = ['Tooling', 'Cash', 'Nakul', 'Sharma Tools', 'Self'];
  for (const [index, label] of wanted.entries()) {
    await fireEvent(screen.getAllByTestId('select-trigger')[index], 'touchEnd');
    await fireEvent.press(await screen.findByText(label));
  }
}

it('will not record an expense with a list left unanswered', async () => {
  await mount();
  await fireEvent.changeText(
    screen.getByPlaceholderText('Router bits, diesel, shop rent'),
    'Router bits',
  );
  await fireEvent.changeText(screen.getAllByPlaceholderText('0')[0], '4500');
  // Each of the five is a column on the row and a line in the ledger; an
  // expense missing one is a row nobody can account for later.
  await fireEvent.press(screen.getByText('Record it'));
  expect(mockCreate).not.toHaveBeenCalled();
});

it('sends what was typed, with the labels the shop keeps', async () => {
  await mount();
  await fireEvent.changeText(
    screen.getByPlaceholderText('Router bits, diesel, shop rent'),
    'Router bits',
  );
  await fireEvent.changeText(screen.getAllByPlaceholderText('0')[0], '4500');
  await pickAll();
  await fireEvent.press(screen.getByText('Record it'));

  await waitFor(() =>
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Router bits',
        amount: 4500,
        spentType: 'Tooling',
        paymentType: 'Cash',
        doneBy: 'Nakul',
        toName: 'Sharma Tools',
        vendor: 'Self',
      }),
    ),
  );
  expect(navigation.replace).toHaveBeenCalledWith('ExpenseDetail', { id: 'e9' });
});

it('keeps the tax half folded away until it is wanted', async () => {
  await mount();
  // Most expenses at a counter have no bill worth claiming, and a form that
  // asks for a GSTIN every time is a form people stop filling in.
  expect(screen.queryByPlaceholderText('27AAACH7409R1ZZ')).toBeNull();
  await fireEvent.press(screen.getByText('Off'));
  expect(await screen.findByPlaceholderText('27AAACH7409R1ZZ')).toBeTruthy();
});

it('opens an existing expense with its tax details already showing', async () => {
  mockExpense.mockResolvedValue({
    id: 'e1',
    date: '2026-09-08',
    description: 'Sheet stock',
    amount: '11800',
    paymentType: 'UPI',
    doneBy: 'Nakul',
    vendor: 'Self',
    spentType: 'Tooling',
    toName: 'Sharma Tools',
    vendorGstin: '09AAACH7409R1ZZ',
    taxAmount: '1800',
    itcEligible: true,
  });
  await mount({ id: 'e1' });
  expect(await screen.findByDisplayValue('Sheet stock')).toBeTruthy();
  // It was recorded with a GSTIN, so hiding that half would hide a correction
  // somebody came here to make.
  expect(screen.getByDisplayValue('09AAACH7409R1ZZ')).toBeTruthy();
});

it('corrects an expense rather than recording a second one', async () => {
  mockExpense.mockResolvedValue({
    id: 'e1',
    date: '2026-09-08',
    description: 'Sheet stock',
    amount: '11800',
    paymentType: 'UPI',
    doneBy: 'Nakul',
    vendor: 'Self',
    spentType: 'Tooling',
    toName: 'Sharma Tools',
    itcEligible: false,
  });
  await mount({ id: 'e1' });
  await fireEvent.press(await screen.findByText('Save'));
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('e1', expect.anything()));
  expect(mockCreate).not.toHaveBeenCalled();
});
