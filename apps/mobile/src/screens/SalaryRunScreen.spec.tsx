import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { PERMISSIONS } from '@decor/shared';
import { SalaryRunScreen } from './SalaryRunScreen';

const mockRun = jest.fn();
const mockAdjust = jest.fn();
const mockApprove = jest.fn();
const mockPay = jest.fn();
const mockDiscard = jest.fn();
jest.mock('../api/client', () => ({
  api: {
    salaryRun: (...a: unknown[]) => mockRun(...a),
    adjustPayslip: (...a: unknown[]) => mockAdjust(...a),
    approveSalaryRun: (...a: unknown[]) => mockApprove(...a),
    paySalaryRun: (...a: unknown[]) => mockPay(...a),
    discardSalaryRun: (...a: unknown[]) => mockDiscard(...a),
  },
}));

let mockPermissions: string[] = [];
jest.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ can: (p: string) => mockPermissions.includes(p) }),
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

const navigation = { goBack: jest.fn(), navigate: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockPermissions = [
    PERMISSIONS.SALARY_VIEW,
    PERMISSIONS.SALARY_MANAGE,
    PERMISSIONS.SALARY_PAY,
  ];
  mockRun.mockResolvedValue(run());
  mockAdjust.mockResolvedValue(SLIP);
  mockApprove.mockResolvedValue(run({ status: 'APPROVED' }));
  mockPay.mockResolvedValue(run({ status: 'PAID' }));
  mockDiscard.mockResolvedValue({ id: 'r1' });
});

const mount = async (data: unknown = run()) => {
  mockRun.mockResolvedValue(data);
  await render(
    <SalaryRunScreen navigation={navigation as never} route={{ params: { id: 'r1' } } as never} />,
  );
  await waitFor(() => expect(mockRun).toHaveBeenCalled());
};

it('shows what a payslip is made of, not only the total', async () => {
  await mount();
  // Somebody is going to check this by hand; a bare number is one they have to
  // take on trust.
  expect(await screen.findByText(/Salary · 26 × ₹26,000/)).toBeTruthy();
  expect(screen.getByText(/Overtime · 2.5 × ₹120/)).toBeTruthy();
  expect(screen.getByText('Advance taken back')).toBeTruthy();
});

it('leads with what the shop will actually hand over', async () => {
  await mount();
  // Once in the heading and once on the only payslip under it.
  expect(await screen.findAllByText('₹21,300')).toHaveLength(2);
  expect(screen.getByText(/₹26,300 earned, less ₹5,000 advanced/)).toBeTruthy();
});

it('keeps approving and paying apart', async () => {
  await mount();
  // Two decisions, often two people.
  expect(await screen.findByText('Approve')).toBeTruthy();
  expect(screen.queryByText('Pay it')).toBeNull();
});

it('offers paying only once it has been approved', async () => {
  await mount(run({ status: 'APPROVED' }));
  expect(await screen.findByText('Pay it')).toBeTruthy();
  expect(screen.queryByText('Approve')).toBeNull();
});

it('asks how it was paid before paying', async () => {
  await mount(run({ status: 'APPROVED' }));
  await fireEvent.press(await screen.findByText('Pay it'));
  expect(await screen.findByText(/One ledger entry per person/)).toBeTruthy();
  expect(mockPay).not.toHaveBeenCalled();
});

it('pays it by the mode chosen', async () => {
  await mount(run({ status: 'APPROVED' }));
  await fireEvent.press(await screen.findByText('Pay it'));
  await fireEvent.press(screen.getAllByText('Pay it')[1]);
  await waitFor(() => expect(mockPay).toHaveBeenCalledWith('r1', 'ONLINE'));
});

it('changes nothing on a month that has been paid', async () => {
  await mount(run({ status: 'PAID' }));
  expect(screen.queryByText('Approve')).toBeNull();
  expect(screen.queryByText('Throw away')).toBeNull();
  await fireEvent.press(screen.getByText('Ramesh'));
  expect(screen.queryByText('Pieces')).toBeNull();
});

it('takes a piece count on a draft', async () => {
  await mount();
  await fireEvent.press(await screen.findByText('Ramesh'));
  await fireEvent.changeText(await screen.findByTestId('pieces'), '120');
  await fireEvent.press(screen.getByText('Save'));
  await waitFor(() =>
    expect(mockAdjust).toHaveBeenCalledWith('r1', 'p1', expect.objectContaining({ pieces: 120 })),
  );
});

it('offers nothing but looking to somebody who may only look', async () => {
  mockPermissions = [PERMISSIONS.SALARY_VIEW];
  await mount(run({ status: 'APPROVED' }));
  expect(screen.queryByText('Pay it')).toBeNull();
  expect(screen.queryByText('Approve')).toBeNull();
});
