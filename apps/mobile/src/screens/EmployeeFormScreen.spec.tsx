import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { EmployeeFormScreen } from './EmployeeFormScreen';

const mockEmployee = jest.fn();
const mockUsers = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
jest.mock('../api/client', () => ({
  api: {
    employee: (...a: unknown[]) => mockEmployee(...a),
    users: () => mockUsers(),
    createEmployee: (...a: unknown[]) => mockCreate(...a),
    updateEmployee: (...a: unknown[]) => mockUpdate(...a),
  },
}));

const navigation = { goBack: jest.fn(), replace: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockUsers.mockResolvedValue([
    { id: 'u1', code: 'PROD01', name: 'Production', role: 'PRODUCTION', isActive: true },
  ]);
  mockCreate.mockResolvedValue({ id: 'e9' });
  mockUpdate.mockResolvedValue({ id: 'e1' });
});

const mount = async (params: Record<string, unknown> = {}) => {
  await render(
    <EmployeeFormScreen navigation={navigation as never} route={{ params } as never} />,
  );
  await waitFor(() => expect(mockUsers).toHaveBeenCalled());
};

it('adds somebody with no login at all', async () => {
  await mount();
  await fireEvent.changeText(screen.getByPlaceholderText('Ramesh Kumar'), 'Ramesh Kumar');
  await fireEvent.press(screen.getByText('Add them'));
  await waitFor(() =>
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Ramesh Kumar', userId: undefined }),
    ),
  );
});

it('will not add somebody with no name', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Add them'));
  expect(mockCreate).not.toHaveBeenCalled();
});

it('sends an Aadhaar without the spaces people type', async () => {
  await mount();
  await fireEvent.changeText(screen.getByPlaceholderText('Ramesh Kumar'), 'Ramesh Kumar');
  await fireEvent.changeText(screen.getByPlaceholderText('1234 1234 1234'), '1234 1234 1234');
  await fireEvent.press(screen.getByText('Add them'));
  await waitFor(() =>
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ aadhaar: '123412341234' }),
    ),
  );
});

it('shows what is on file rather than pretending to have the number', async () => {
  mockEmployee.mockResolvedValue({
    id: 'e1',
    code: 'EMP-0001',
    name: 'Ramesh Kumar',
    joinedOn: '2026-04-01',
    status: 'ACTIVE',
    aadhaarLast4: '1234',
    panLast4: '234F',
  });
  await mount({ id: 'e1' });
  // What is stored is encrypted; the form cannot show it and does not lie.
  expect(await screen.findByPlaceholderText('•••• •••• 1234')).toBeTruthy();
  expect(screen.getByPlaceholderText('•••••234F')).toBeTruthy();
});

it('corrects somebody rather than adding a second row', async () => {
  mockEmployee.mockResolvedValue({
    id: 'e1',
    code: 'EMP-0001',
    name: 'Ramesh Kumar',
    joinedOn: '2026-04-01',
    status: 'ACTIVE',
  });
  await mount({ id: 'e1' });
  await fireEvent.press(await screen.findByText('Save'));
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('e1', expect.anything()));
  expect(mockCreate).not.toHaveBeenCalled();
});
