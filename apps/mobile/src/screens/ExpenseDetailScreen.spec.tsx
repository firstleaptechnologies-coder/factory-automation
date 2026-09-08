import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { PERMISSIONS } from '@decor/shared';
import { ExpenseDetailScreen } from './ExpenseDetailScreen';

const mockExpense = jest.fn();
const mockHistory = jest.fn();
const mockDelete = jest.fn();
const mockAttachBill = jest.fn();
const mockRemoveBill = jest.fn();
jest.mock('../api/client', () => ({
  api: {
    expense: (...a: unknown[]) => mockExpense(...a),
    history: (...a: unknown[]) => mockHistory(...a),
    deleteExpense: (...a: unknown[]) => mockDelete(...a),
    attachExpenseBillNative: (...a: unknown[]) => mockAttachBill(...a),
    removeExpenseBill: (...a: unknown[]) => mockRemoveBill(...a),
    fileUrl: (id: string) => `http://api.test/files/${id}`,
  },
}));

const mockCamera = jest.fn();
jest.mock('react-native-image-picker', () => ({
  launchCamera: (...a: unknown[]) => mockCamera(...a),
  launchImageLibrary: (...a: unknown[]) => mockCamera(...a),
}));

let mockPermissions: string[] = [];
jest.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ can: (p: string) => mockPermissions.includes(p) }),
}));

const EXPENSE = {
  id: 'e1',
  date: '2026-09-08',
  description: 'Sheet stock',
  amount: '11800',
  paymentType: 'UPI',
  doneBy: 'Nakul',
  toName: 'Verma Ply',
  vendor: 'Self',
  spentType: 'Raw material',
  note: 'Two sheets short',
  vendorGstin: '09AAACH7409R1ZZ',
  taxableValue: '10000',
  taxAmount: '1800',
  itcEligible: true,
  order: { id: 'o1', code: 'ORD-1', client: { name: 'Verma Interiors' } },
  createdBy: { id: 'u1', name: 'Nakul' },
  createdAt: '2026-09-08T10:00:00Z',
  updatedAt: '2026-09-08T10:00:00Z',
};

const navigation = { goBack: jest.fn(), navigate: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockPermissions = [PERMISSIONS.EXPENSE_VIEW, PERMISSIONS.EXPENSE_MANAGE];
  mockExpense.mockResolvedValue(EXPENSE);
  mockHistory.mockResolvedValue([]);
  mockDelete.mockResolvedValue({ id: 'e1' });
  mockAttachBill.mockResolvedValue({ id: 'e1' });
  mockRemoveBill.mockResolvedValue({ id: 'e1' });
  mockCamera.mockResolvedValue({
    assets: [{ uri: 'file:///bill.jpg', type: 'image/jpeg', fileName: 'bill.jpg' }],
  });
});

const mount = async (row: unknown = EXPENSE) => {
  mockExpense.mockResolvedValue(row);
  await render(
    <ExpenseDetailScreen navigation={navigation as never} route={{ params: { id: 'e1' } } as never} />,
  );
  await waitFor(() => expect(mockExpense).toHaveBeenCalled());
};

it('says what it was, who got it and how it was paid', async () => {
  await mount();
  expect(await screen.findByText('₹11,800')).toBeTruthy();
  expect(screen.getByText('UPI · paid to Verma Ply')).toBeTruthy();
  expect(screen.getByText('ORD-1 · Verma Interiors')).toBeTruthy();
});

it('shows the tax, and whether the credit can be claimed', async () => {
  await mount();
  // An expense whose tax can be claimed is a different number to the accountant.
  expect(await screen.findByText('Credit claimable')).toBeTruthy();
  expect(screen.getByText('09AAACH7409R1ZZ')).toBeTruthy();
});

it('leaves the tax card off a bill that had none', async () => {
  await mount({ ...EXPENSE, vendorGstin: null, taxAmount: null, taxableValue: null });
  expect(screen.queryByText('Tax on this bill')).toBeNull();
});

it('reads the trail from the same history everything else uses', async () => {
  await mount();
  expect(mockHistory).toHaveBeenCalledWith('expenses', 'e1');
});

it('offers editing and deleting only to somebody who may', async () => {
  mockPermissions = [PERMISSIONS.EXPENSE_VIEW];
  await mount();
  expect(screen.queryByText('Delete')).toBeNull();
});

it('asks before deleting, and says the history keeps a record', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await mount();
  await fireEvent.press(await screen.findByText('Delete'));
  expect(alert).toHaveBeenCalledWith(
    'Delete this expense?',
    expect.stringContaining('ledger entry'),
    expect.any(Array),
  );
  expect(mockDelete).not.toHaveBeenCalled();
  alert.mockRestore();
});

it('deletes once that is confirmed', async () => {
  const alert = jest
    .spyOn(Alert, 'alert')
    .mockImplementation((_title, _message, buttons) => {
      const confirm = (buttons ?? []).find((button) => button.style === 'destructive');
      void confirm?.onPress?.();
    });
  await mount();
  await fireEvent.press(await screen.findByText('Delete'));
  await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('e1'));
  expect(navigation.goBack).toHaveBeenCalled();
  alert.mockRestore();
});

describe('the bill', () => {
  it('offers to photograph one when none is attached', async () => {
    await mount();
    expect(await screen.findByText('Photograph it')).toBeTruthy();
  });

  it('shoots it at the size-image target, because a bill is read', async () => {
    await mount();
    await fireEvent.press(await screen.findByText('Photograph it'));
    // The harder reference-image compression turns a printed rate into a smudge.
    expect(mockCamera.mock.calls[0][0]).toMatchObject({ maxWidth: 3000 });
    await waitFor(() =>
      expect(mockAttachBill).toHaveBeenCalledWith('e1', {
        uri: 'file:///bill.jpg',
        type: 'image/jpeg',
        name: 'bill.jpg',
      }),
    );
  });

  it('sends nothing when the camera was backed out of', async () => {
    mockCamera.mockResolvedValue({ didCancel: true });
    await mount();
    await fireEvent.press(await screen.findByText('Photograph it'));
    expect(mockAttachBill).not.toHaveBeenCalled();
  });

  it('shows the bill once there is one, and offers to replace it', async () => {
    await mount({
      ...EXPENSE,
      bill: { id: 'f1', fileName: 'bill.webp', mimeType: 'image/webp', byteSize: 1000 },
    });
    expect(await screen.findByText('Remove')).toBeTruthy();
    await fireEvent.press(screen.getByText('Remove'));
    await waitFor(() => expect(mockRemoveBill).toHaveBeenCalledWith('e1'));
  });

  it('says plainly that there is none, to somebody who cannot add one', async () => {
    mockPermissions = [PERMISSIONS.EXPENSE_VIEW];
    await mount();
    expect(await screen.findByText('No bill was attached.')).toBeTruthy();
  });
});
