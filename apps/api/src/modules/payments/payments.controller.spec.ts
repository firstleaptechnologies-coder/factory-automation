import { PaymentsController } from './payments.controller';

const payments = {
  summary: jest.fn(async (..._a: unknown[]) => 'summary'),
  record: jest.fn(async (..._a: unknown[]) => 'recorded'),
  remove: jest.fn(async (..._a: unknown[]) => 'removed'),
  deposit: jest.fn(async (..._a: unknown[]) => 'deposited'),
  cashPosition: jest.fn(async (..._a: unknown[]) => 'position'),
  cashInHandByOrder: jest.fn(async (..._a: unknown[]) => 'in hand'),
};

const controller = new PaymentsController(payments as never);
const USER = { id: 'u1', code: 'SALES01', role: 'SALES', permissions: [] } as never;

beforeEach(() => jest.clearAllMocks());

it('reads the ledger for one order', async () => {
  await controller.summary('o1');
  expect(payments.summary).toHaveBeenCalledWith('o1');
});

it('records who took the money, not only how much', async () => {
  const dto = { amount: 20000, mode: 'CASH' };
  await controller.record('o1', dto as never, USER);
  // A receipt with no name against it is not much of a receipt.
  expect(payments.record).toHaveBeenCalledWith('o1', dto, 'u1');
});

it('records a payment even when the caller is somehow unidentified', async () => {
  await controller.record('o1', { amount: 1 } as never, undefined as never);
  expect(payments.record).toHaveBeenCalledWith('o1', { amount: 1 }, undefined);
});

it('records who banked the cash', async () => {
  const dto = { paymentId: 'p1', amount: 5000 };
  await controller.deposit(dto as never, USER);
  expect(payments.deposit).toHaveBeenCalledWith(dto, 'u1');
});

it('deletes a receipt by its own id', async () => {
  await controller.remove('p1');
  expect(payments.remove).toHaveBeenCalledWith('p1');
});

it('passes the date range through to the cash position', async () => {
  const query = { from: '2026-09-01', to: '2026-09-30' };
  await controller.cashPosition(query as never);
  expect(payments.cashPosition).toHaveBeenCalledWith(query);
});

it('lists what is still in hand order by order, so somebody can be asked', async () => {
  await controller.cashInHand();
  expect(payments.cashInHandByOrder).toHaveBeenCalled();
});
