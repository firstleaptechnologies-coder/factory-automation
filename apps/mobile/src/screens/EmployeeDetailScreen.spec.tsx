import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { PERMISSIONS } from '@decor/shared';
import { EmployeeDetailScreen } from './EmployeeDetailScreen';

const mockEmployee = jest.fn();
const mockIdentifiers = jest.fn();
const mockMarkLeft = jest.fn();
jest.mock('../api/client', () => ({
  api: {
    employee: (...a: unknown[]) => mockEmployee(...a),
    employeeIdentifiers: (...a: unknown[]) => mockIdentifiers(...a),
    markEmployeeLeft: (...a: unknown[]) => mockMarkLeft(...a),
  },
}));

let mockPermissions: string[] = [];
jest.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ can: (p: string) => mockPermissions.includes(p) }),
}));

const PERSON = {
  id: 'e1',
  code: 'EMP-0001',
  name: 'Ramesh Kumar',
  phone: '9876543210',
  designation: 'CNC operator',
  department: 'Production',
  joinedOn: '2026-04-01',
  status: 'ACTIVE',
  aadhaarLast4: '1234',
  panLast4: '234F',
  bankAccountLast4: '6789',
  bankIfsc: 'HDFC0001234',
  user: null,
  createdAt: '2026-04-01T00:00:00Z',
  updatedAt: '2026-04-01T00:00:00Z',
};

const navigation = { goBack: jest.fn(), navigate: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockPermissions = [
    PERMISSIONS.EMPLOYEE_VIEW,
    PERMISSIONS.EMPLOYEE_MANAGE,
    PERMISSIONS.EMPLOYEE_IDENTIFIERS,
  ];
  mockEmployee.mockResolvedValue(PERSON);
  mockIdentifiers.mockResolvedValue({
    aadhaar: '123412341234',
    pan: 'ABCDE1234F',
    bankAccountNumber: '50100123456789',
  });
  mockMarkLeft.mockResolvedValue({ id: 'e1' });
});

const mount = async (person: unknown = PERSON) => {
  mockEmployee.mockResolvedValue(person);
  await render(
    <EmployeeDetailScreen
      navigation={navigation as never}
      route={{ params: { id: 'e1' } } as never}
    />,
  );
  await waitFor(() => expect(mockEmployee).toHaveBeenCalled());
};

describe('what is on the screen and what is not', () => {
  it('shows only the last four digits until somebody asks', async () => {
    await mount();
    // A list of staff should not carry every identifier in the shop through
    // the browser.
    expect(await screen.findByText('•••• •••• 1234')).toBeTruthy();
    expect(mockIdentifiers).not.toHaveBeenCalled();
  });

  it('fetches the whole numbers when somebody does ask', async () => {
    await mount();
    await fireEvent.press(await screen.findByText('Show the full numbers'));
    await waitFor(() => expect(mockIdentifiers).toHaveBeenCalledWith('e1'));
    expect(await screen.findByText('123412341234')).toBeTruthy();
  });

  it('offers nobody without the permission a way to ask', async () => {
    mockPermissions = [PERMISSIONS.EMPLOYEE_VIEW];
    await mount();
    expect(screen.queryByText('Show the full numbers')).toBeNull();
  });

  it('does not offer to reveal what is not on file', async () => {
    await mount({ ...PERSON, aadhaarLast4: null, panLast4: null, bankAccountLast4: null });
    expect(screen.queryByText('Show the full numbers')).toBeNull();
    expect(screen.getAllByText('Not on file').length).toBeGreaterThan(0);
  });
});

describe('the login, which is a different thing', () => {
  it('says plainly when somebody does not use the app', async () => {
    await mount();
    expect(await screen.findByText('None — they do not use the app')).toBeTruthy();
  });

  it('names the login when there is one', async () => {
    await mount({
      ...PERSON,
      user: { id: 'u1', name: 'Ramesh', code: 'PROD01', isActive: true },
    });
    expect(await screen.findByText('Ramesh · PROD01')).toBeTruthy();
  });
});

describe('somebody leaving', () => {
  it('says what happens to the record before it happens', async () => {
    await mount();
    await fireEvent.press(await screen.findByText('They have left'));
    expect(await screen.findByText(/attendance and payslips hang off it/)).toBeTruthy();
    expect(mockMarkLeft).not.toHaveBeenCalled();
  });

  it('marks them left on the day given', async () => {
    await mount();
    await fireEvent.press(await screen.findByText('They have left'));
    await fireEvent.changeText(screen.getByPlaceholderText('YYYY-MM-DD'), '2026-09-30');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(mockMarkLeft).toHaveBeenCalledWith('e1', '2026-09-30'));
  });

  it('does not offer it twice', async () => {
    await mount({ ...PERSON, status: 'LEFT', leftOn: '2026-08-31' });
    expect(screen.queryByText('They have left')).toBeNull();
  });
});
