import { PayrollController } from './payroll.controller';

const payroll = {
  structures: jest.fn(async (..._a: unknown[]) => 'structures'),
  setStructure: jest.fn(async (..._a: unknown[]) => 'set'),
  advances: jest.fn(async (..._a: unknown[]) => 'advances'),
  giveAdvance: jest.fn(async (..._a: unknown[]) => 'given'),
  runs: jest.fn(async () => 'runs'),
  run: jest.fn(async (..._a: unknown[]) => 'run'),
  open: jest.fn(async (..._a: unknown[]) => 'opened'),
  adjust: jest.fn(async (..._a: unknown[]) => 'adjusted'),
  approve: jest.fn(async (..._a: unknown[]) => 'approved'),
  pay: jest.fn(async (..._a: unknown[]) => 'paid'),
  discard: jest.fn(async (..._a: unknown[]) => 'discarded'),
};

const controller = new PayrollController(payroll as never);

beforeEach(() => jest.clearAllMocks());

it('narrows arrangements and advances to one person when asked', async () => {
  await controller.structures('e1');
  await controller.advances('e1');
  expect(payroll.structures).toHaveBeenCalledWith('e1');
  expect(payroll.advances).toHaveBeenCalledWith('e1');
});

it('records who set the pay and who gave the advance, from the session', async () => {
  await controller.setStructure({ rate: 1 } as never, { id: 'u9' } as never);
  await controller.giveAdvance({ amount: 1 } as never, { id: 'u9' } as never);
  expect(payroll.setStructure).toHaveBeenCalledWith({ rate: 1 }, 'u9');
  expect(payroll.giveAdvance).toHaveBeenCalledWith({ amount: 1 }, 'u9');
});

it('opens a month with the days the shop calls a month', async () => {
  await controller.open({ month: '2026-09', workingDays: 26 } as never, undefined);
  expect(payroll.open).toHaveBeenCalledWith({ month: '2026-09', workingDays: 26 }, undefined);
});

it('adjusts one payslip inside its own run', async () => {
  await controller.adjust('r1', 'p1', { pieces: 120 } as never);
  expect(payroll.adjust).toHaveBeenCalledWith('r1', 'p1', { pieces: 120 });
});

it('keeps approving and paying apart', async () => {
  // Working out what a month costs and handing the money over are different
  // decisions, often by different people.
  await controller.approve('r1');
  await controller.pay('r1', { mode: 'ONLINE' } as never, { id: 'u9' } as never);
  expect(payroll.approve).toHaveBeenCalledWith('r1');
  expect(payroll.pay).toHaveBeenCalledWith('r1', { mode: 'ONLINE' }, 'u9');
});

it('throws a draft away by its own id', async () => {
  await controller.discard('r1');
  expect(payroll.discard).toHaveBeenCalledWith('r1');
});
