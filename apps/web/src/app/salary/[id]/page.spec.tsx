import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Suspense } from 'react';
import { PERMISSIONS } from '@fas/shared';
import SalaryRunPage from './page';

const apiMock = {
  salaryRun: jest.fn(),
  adjustPayslip: jest.fn(),
  approveSalaryRun: jest.fn(),
  paySalaryRun: jest.fn(),
  discardSalaryRun: jest.fn(),
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
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

let permissions: string[] = [];
jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ can: (p: string) => permissions.includes(p) }),
}));

jest.mock('@/components/Shell', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const SLIP = {
  id: 'p1',
  runId: 'r1',
  employeeId: 'e1',
  employee: { id: 'e1', code: 'EMP-0001', name: 'Ramesh', designation: 'Operator' },
  payableDays: 26,
  overtimeMinutes: 150,
  pieces: null,
  lines: [
    { kind: 'MONTHLY', label: 'Salary', rate: 26000, quantity: 26, amount: 26000 },
    { kind: 'OVERTIME', label: 'Overtime', rate: 120, quantity: 2.5, amount: 300 },
  ],
  gross: 26300,
  advanceDeducted: 5000,
  otherDeductions: 0,
  net: 21300,
};

const run = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  month: '2026-09-01',
  status: 'DRAFT',
  workingDays: 26,
  payslips: [SLIP],
  totals: { gross: 26300, advances: 5000, deductions: 0, net: 21300, count: 1 },
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  permissions = [PERMISSIONS.SALARY_VIEW, PERMISSIONS.SALARY_MANAGE, PERMISSIONS.SALARY_PAY];
  apiMock.salaryRun.mockResolvedValue(run());
  apiMock.adjustPayslip.mockResolvedValue(SLIP);
  apiMock.approveSalaryRun.mockResolvedValue(run({ status: 'APPROVED' }));
  apiMock.paySalaryRun.mockResolvedValue(run({ status: 'PAID' }));
  apiMock.discardSalaryRun.mockResolvedValue({ id: 'r1' });
});

const mount = async (data: unknown = run()) => {
  apiMock.salaryRun.mockResolvedValue(data);
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <SalaryRunPage params={Promise.resolve({ id: 'r1' })} />
      </Suspense>,
    );
  });
};

it('shows what a payslip is made of, not only the total', async () => {
  await mount();
  // Somebody is going to check this by hand; a bare number is one they have to
  // take on trust.
  expect(await screen.findByText(/Salary · 26 × ₹26,000 = ₹26,000/)).toBeInTheDocument();
  expect(screen.getByText(/Overtime · 2.5 × ₹120 = ₹300/)).toBeInTheDocument();
});

it('leads with what the shop will actually hand over', async () => {
  await mount();
  expect(
    await screen.findByText(/₹26,300 earned, less ₹5,000 advanced/),
  ).toBeInTheDocument();
});

it('keeps approving and paying apart', async () => {
  await mount();
  expect(await screen.findByText('Approve')).toBeInTheDocument();
  expect(screen.queryByText('Pay it')).toBeNull();
});

it('offers paying only once it has been approved', async () => {
  await mount(run({ status: 'APPROVED' }));
  expect(await screen.findByText('Pay it')).toBeInTheDocument();
  expect(screen.queryByText('Approve')).toBeNull();
});

it('asks how it was paid, then pays it', async () => {
  await mount(run({ status: 'APPROVED' }));
  fireEvent.click(await screen.findByText('Pay it'));
  expect(await screen.findByText(/One ledger entry per person/)).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole('button', { name: 'Pay it' })[1]);
  await waitFor(() => expect(apiMock.paySalaryRun).toHaveBeenCalledWith('r1', 'ONLINE'));
});

it('changes nothing on a month that has been paid', async () => {
  await mount(run({ status: 'PAID' }));
  expect(screen.queryByText('Approve')).toBeNull();
  fireEvent.click(screen.getByText('Ramesh'));
  expect(screen.queryByText('Pieces')).toBeNull();
});

it('takes a piece count on a draft', async () => {
  await mount();
  fireEvent.click(await screen.findByText('Ramesh'));
  // The field's hint is inside its label, so the accessible name carries both.
  fireEvent.change(await screen.findByLabelText(/Pieces/), { target: { value: '120' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(apiMock.adjustPayslip).toHaveBeenCalledWith(
      'r1',
      'p1',
      expect.objectContaining({ pieces: 120 }),
    ),
  );
});

it('offers nothing but looking to somebody who may only look', async () => {
  permissions = [PERMISSIONS.SALARY_VIEW];
  await mount(run({ status: 'APPROVED' }));
  expect(screen.queryByText('Pay it')).toBeNull();
});
