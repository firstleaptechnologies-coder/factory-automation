import { DisbursementsController } from './disbursements.controller';

const disbursements = {
  label: jest.fn(async (..._a: unknown[]) => 'ISC'),
  setLabel: jest.fn(async (..._a: unknown[]) => 'set'),
  listCategories: jest.fn(async (..._a: unknown[]) => 'categories'),
  createCategory: jest.fn(async (..._a: unknown[]) => 'created'),
  deactivateCategory: jest.fn(async (..._a: unknown[]) => 'gone'),
  ledger: jest.fn(async (..._a: unknown[]) => 'ledger'),
  forOrder: jest.fn(async (..._a: unknown[]) => 'order ledger'),
  create: jest.fn(async (..._a: unknown[]) => 'created'),
  settle: jest.fn(async (..._a: unknown[]) => 'settled'),
  update: jest.fn(async (..._a: unknown[]) => 'updated'),
  remove: jest.fn(async (..._a: unknown[]) => 'removed'),
  reverse: jest.fn(async (..._a: unknown[]) => 'taken back'),
};

const controller = new DisbursementsController(disbursements as never);
const USER = { id: 'u1', code: 'ADMIN', role: 'ADMIN', permissions: [] } as never;

beforeEach(() => jest.clearAllMocks());

it('answers what this shop calls its payouts', async () => {
  // Every heading in both apps follows this word.
  expect(await controller.label()).toEqual({ label: 'ISC' });
});

it('renames them from the word alone', async () => {
  await controller.setLabel({ label: 'Payouts' } as never);
  expect(disbursements.setLabel).toHaveBeenCalledWith('Payouts');
});

it('hides the retired categories unless the admin screen asks', async () => {
  await controller.listCategories();
  expect(disbursements.listCategories).toHaveBeenCalledWith(false);
  await controller.listCategories('true');
  expect(disbursements.listCategories).toHaveBeenLastCalledWith(true);
});

it('adds and retires a category', async () => {
  await controller.createCategory({ name: 'Fitting' } as never);
  await controller.deactivateCategory('c1');
  expect(disbursements.createCategory).toHaveBeenCalledWith({ name: 'Fitting' });
  expect(disbursements.deactivateCategory).toHaveBeenCalledWith('c1');
});

it('reads the whole ledger, filtered', async () => {
  await controller.ledger({ status: 'PLANNED' } as never);
  expect(disbursements.ledger).toHaveBeenCalledWith({ status: 'PLANNED' });
});

it('reads what one order owes other people', async () => {
  await controller.forOrder('o1');
  expect(disbursements.forOrder).toHaveBeenCalledWith('o1');
});

it('records who committed a payout, against the order it comes out of', async () => {
  const dto = { payeeName: 'Ramesh', amount: 4000 };
  await controller.create('o1', dto as never, USER);
  expect(disbursements.create).toHaveBeenCalledWith('o1', dto, 'u1');
});

it('records who settled one', async () => {
  await controller.settle('d1', { paidMode: 'CASH' } as never, USER);
  expect(disbursements.settle).toHaveBeenCalledWith('d1', { paidMode: 'CASH' }, 'u1');
});

it('edits and removes a payout by its own id', async () => {
  await controller.update('d1', { amount: 5000 } as never);
  await controller.remove('d1');
  expect(disbursements.update).toHaveBeenCalledWith('d1', { amount: 5000 });
  expect(disbursements.remove).toHaveBeenCalledWith('d1');
});

it('takes a settled payout back, with who did it from the session', async () => {
  await controller.reverse('d1', { reason: 'Paid the wrong fitter' } as never, {
    id: 'u9',
  } as never);
  expect(disbursements.reverse).toHaveBeenCalledWith('d1', 'Paid the wrong fitter', 'u9');
});
