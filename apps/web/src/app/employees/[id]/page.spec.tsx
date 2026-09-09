import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Suspense } from 'react';
import { PERMISSIONS } from '@fas/shared';
import EmployeePage from './page';

const apiMock = {
  employee: jest.fn(),
  employeeIdentifiers: jest.fn(),
  markEmployeeLeft: jest.fn(),
  users: jest.fn(),
};
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
let query = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => query,
}));

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
  aadhaarLast4: '1234',
  panLast4: '234F',
  bankAccountLast4: '6789',
  bankIfsc: 'HDFC0001234',
  user: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  query = new URLSearchParams();
  permissions = [
    PERMISSIONS.EMPLOYEE_VIEW,
    PERMISSIONS.EMPLOYEE_MANAGE,
    PERMISSIONS.EMPLOYEE_IDENTIFIERS,
  ];
  apiMock.employee.mockResolvedValue(PERSON);
  apiMock.employeeIdentifiers.mockResolvedValue({
    aadhaar: '123412341234',
    pan: 'ABCDE1234F',
    bankAccountNumber: '50100123456789',
  });
  apiMock.markEmployeeLeft.mockResolvedValue({ id: 'e1' });
  apiMock.users.mockResolvedValue([]);
});

const mount = async (person: unknown = PERSON) => {
  apiMock.employee.mockResolvedValue(person);
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <EmployeePage params={Promise.resolve({ id: 'e1' })} />
      </Suspense>,
    );
  });
};

describe('what is on the screen and what is not', () => {
  it('shows only the last four digits until somebody asks', async () => {
    await mount();
    // A staff list should not carry every identifier in the shop through the
    // browser.
    expect(await screen.findByText('•••• •••• 1234')).toBeInTheDocument();
    expect(apiMock.employeeIdentifiers).not.toHaveBeenCalled();
  });

  it('fetches the whole numbers when somebody does ask', async () => {
    await mount();
    fireEvent.click(await screen.findByText('Show the full numbers'));
    await waitFor(() => expect(apiMock.employeeIdentifiers).toHaveBeenCalledWith('e1'));
    expect(await screen.findByText('123412341234')).toBeInTheDocument();
  });

  it('offers nobody without the permission a way to ask', async () => {
    permissions = [PERMISSIONS.EMPLOYEE_VIEW];
    await mount();
    expect(screen.queryByText('Show the full numbers')).toBeNull();
  });

  it('does not offer to reveal what is not on file', async () => {
    await mount({ ...PERSON, aadhaarLast4: null, panLast4: null, bankAccountLast4: null });
    expect(screen.queryByText('Show the full numbers')).toBeNull();
  });
});

describe('the login, which is a different thing', () => {
  it('says plainly when somebody does not use the app', async () => {
    await mount();
    expect(await screen.findByText('None — they do not use the app')).toBeInTheDocument();
  });

  it('names the login when there is one', async () => {
    await mount({
      ...PERSON,
      user: { id: 'u1', name: 'Ramesh', code: 'PROD01', isActive: true },
    });
    expect(await screen.findByText('Ramesh · PROD01')).toBeInTheDocument();
  });
});

describe('somebody leaving', () => {
  it('says what happens to the record before it happens', async () => {
    await mount();
    fireEvent.click(await screen.findByText('They have left'));
    expect(await screen.findByText(/attendance and payslips hang off it/)).toBeInTheDocument();
    expect(apiMock.markEmployeeLeft).not.toHaveBeenCalled();
  });

  it('marks them left on the day given', async () => {
    await mount();
    fireEvent.click(await screen.findByText('They have left'));
    fireEvent.change(await screen.findByLabelText('Last day'), {
      target: { value: '2026-09-30' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(apiMock.markEmployeeLeft).toHaveBeenCalledWith('e1', '2026-09-30'),
    );
  });

  it('does not offer it twice', async () => {
    await mount({ ...PERSON, status: 'LEFT', leftOn: '2026-08-31' });
    expect(screen.queryByText('They have left')).toBeNull();
  });
});

it('edits on the same address rather than a page of its own', async () => {
  query = new URLSearchParams('edit=1');
  await mount();
  expect(await screen.findByText('Edit employee')).toBeInTheDocument();
});
