import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PERMISSIONS } from '@fas/shared';
import EmployeesPage from './page';

const apiMock = { employees: jest.fn() };
jest.mock('@/lib/api', () => ({
  api: new Proxy(
    {},
    {
      get: (_t, key: string) => (...args: never[]) =>
        (apiMock[key as keyof typeof apiMock] as (...a: never[]) => unknown)(...args),
    },
  ),
}));

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

let permissions: string[] = [];
jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ can: (p: string) => permissions.includes(p) }),
}));

jest.mock('@/components/Shell', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
  user: null,
};

const page = (rows: unknown[]) => ({
  data: rows,
  meta: { page: 1, limit: 25, total: rows.length, pages: 1 },
});

beforeEach(() => {
  jest.clearAllMocks();
  permissions = [PERMISSIONS.EMPLOYEE_VIEW, PERMISSIONS.EMPLOYEE_MANAGE];
  apiMock.employees.mockResolvedValue(page([PERSON]));
});

const mount = async () => {
  render(<EmployeesPage />);
  await screen.findByText('Employees');
};

it('says who somebody is and what they do', async () => {
  await mount();
  expect(await screen.findByText('Ramesh Kumar')).toBeInTheDocument();
  expect(screen.getByText('CNC operator')).toBeInTheDocument();
  expect(screen.getByText('EMP-0001')).toBeInTheDocument();
});

it('says plainly when somebody has no login, because most will not', async () => {
  await mount();
  expect(await screen.findByText('None')).toBeInTheDocument();
});

it('asks for everyone still here, not everyone who ever was', async () => {
  await mount();
  expect(apiMock.employees.mock.calls[0][0].status).toBeUndefined();
});

it('can be asked for the people who have gone', async () => {
  await mount();
  fireEvent.click(screen.getByText('Filter'));
  fireEvent.click(await screen.findByText('Left'));
  fireEvent.click(screen.getByText(/Apply/));
  await waitFor(() =>
    expect(apiMock.employees).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'LEFT' }),
    ),
  );
});

it('offers to add somebody only to whoever may', async () => {
  permissions = [PERMISSIONS.EMPLOYEE_VIEW];
  await mount();
  expect(screen.queryByText('Add someone')).toBeNull();
});

it('opens one person, and the form for a new one', async () => {
  await mount();
  fireEvent.click(await screen.findByText('Ramesh Kumar'));
  expect(push).toHaveBeenCalledWith('/employees/e1');
  fireEvent.click(screen.getByText('Add someone'));
  expect(push).toHaveBeenCalledWith('/employees/new');
});

it('says so plainly when nobody has been added', async () => {
  apiMock.employees.mockResolvedValue(page([]));
  await mount();
  expect(await screen.findByText('Nobody on the list yet')).toBeInTheDocument();
});
