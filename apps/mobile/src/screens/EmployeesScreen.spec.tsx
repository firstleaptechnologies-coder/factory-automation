import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { PERMISSIONS } from '@fas/shared';
import { EmployeesScreen } from './EmployeesScreen';

const mockEmployees = jest.fn();
jest.mock('../api/client', () => ({
  api: { employees: (...a: unknown[]) => mockEmployees(...a) },
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
  createdAt: '2026-04-01T00:00:00Z',
  updatedAt: '2026-04-01T00:00:00Z',
};

const page = (rows: unknown[]) => ({
  data: rows,
  meta: { page: 1, pages: 1, total: rows.length, limit: 25 },
});

const navigation = { goBack: jest.fn(), navigate: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockPermissions = [PERMISSIONS.EMPLOYEE_VIEW, PERMISSIONS.EMPLOYEE_MANAGE];
  mockEmployees.mockResolvedValue(page([PERSON]));
});

const mount = async () => {
  await render(<EmployeesScreen navigation={navigation as never} />);
  await waitFor(() => expect(mockEmployees).toHaveBeenCalled());
};

it('says who somebody is and what they do', async () => {
  await mount();
  expect(await screen.findByText('Ramesh Kumar')).toBeTruthy();
  expect(screen.getByText('CNC operator · Production')).toBeTruthy();
  expect(screen.getByText(/EMP-0001/)).toBeTruthy();
});

it('asks for everyone still here, not everyone who ever was', async () => {
  await mount();
  // The question this screen answers is nearly always "who is on the floor".
  expect(mockEmployees.mock.calls[0][0].status).toBeUndefined();
});

it('can be asked for the people who have gone', async () => {
  await mount();
  await fireEvent.press(screen.getByTestId('filter-button'));
  await fireEvent.press(await screen.findByText('Left'));
  await fireEvent.press(screen.getByText('Apply 1 filter'));
  await waitFor(() =>
    expect(mockEmployees).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'LEFT' }),
    ),
  );
});

it('searches what somebody would type', async () => {
  await mount();
  await fireEvent.changeText(
    screen.getByPlaceholderText('Name, number or what they do'),
    'ramesh',
  );
  await waitFor(() =>
    expect(mockEmployees).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'ramesh' }),
    ),
  );
});

it('offers to add somebody only to whoever may', async () => {
  mockPermissions = [PERMISSIONS.EMPLOYEE_VIEW];
  await mount();
  expect(screen.queryByTestId('add-employee')).toBeNull();
});

it('opens one person, and the form for a new one', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Ramesh Kumar'));
  expect(navigation.navigate).toHaveBeenCalledWith('EmployeeDetail', { id: 'e1' });
  await fireEvent.press(screen.getByTestId('add-employee'));
  expect(navigation.navigate).toHaveBeenCalledWith('EmployeeForm', {});
});

it('says so plainly when nobody has been added', async () => {
  mockEmployees.mockResolvedValue(page([]));
  await mount();
  expect(await screen.findByText('Nobody on the list yet')).toBeTruthy();
});
