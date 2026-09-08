import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  ExpensesService,
  dateOnly,
  diffExpense,
  expenseFilter,
  groupBy,
  monthlySeries,
} from './expenses.service';
import { accountForPaymentType, expensePosting } from '../ledger/postings';
import { inTenant, prismaMock, ledgerMock } from '../../../test/prisma-mock';

type Db = Record<string, Record<string, jest.Mock>>;

const SPEND = {
  date: '2026-09-08',
  description: 'Router bits',
  amount: 4500,
  paymentType: 'Cash',
  doneBy: 'Nakul',
  toName: 'Sharma Tools',
  vendor: 'Self',
  spentType: 'Tooling',
};

function build() {
  const db = prismaMock() as never as Db;
  const ledger = ledgerMock();
  db.expense.create = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'e1',
    ...data,
    date: data.date,
    amount: data.amount,
    taxAmount: null,
    vendorGstin: null,
    note: null,
    orderId: null,
    createdById: null,
  }));
  db.expense.update = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'e1',
    ...data,
    taxAmount: null,
    vendorGstin: null,
    note: null,
    orderId: null,
    createdById: null,
  }));
  const files = {
    ingest: jest.fn(async (..._args: unknown[]) => ({ id: 'f1' })),
  };
  return {
    service: new ExpensesService(db as never, ledger as never, files as never),
    db,
    ledger,
    files,
  };
}

const dto = (over: Record<string, unknown> = {}) => ({ ...SPEND, ...over }) as never;

/** The same expense as the database hands it back, for comparing against. */
const SPEND_ROW = {
  id: 'e1',
  date: new Date('2026-09-08T00:00:00.000Z'),
  description: 'Router bits',
  amount: 4500,
  paymentType: 'Cash',
  doneBy: 'Nakul',
  toName: 'Sharma Tools',
  vendor: 'Self',
  spentType: 'Tooling',
  note: null,
  vendorGstin: null,
  taxableValue: null,
  taxAmount: null,
  itcEligible: false,
  orderId: null,
  reversalOfId: null,
};

describe('recording what was spent', () => {
  it('posts it to the ledger, so spending is on the same screen as taking', async () => {
    const { service, ledger } = build();
    await inTenant(() => service.create(dto()));
    expect(ledger.post).toHaveBeenCalledTimes(1);
    expect(ledger.post.mock.calls[0][0]).toMatchObject({
      sourceType: 'Expense',
      direction: 'OUT',
      amount: 4500,
      accountHead: 'Tooling',
      party: 'Sharma Tools',
    });
  });

  it('takes cash out of the drawer when the shop says that type is cash', async () => {
    const { service, db, ledger } = build();
    db.expenseOption.findFirst = jest.fn(async () => ({ account: 'CASH' }));
    await inTenant(() => service.create(dto({ paymentType: 'Petty cash' })));
    expect(ledger.post.mock.calls[0][0].account).toBe('CASH');
  });

  it('leaves the drawer alone when it came out of the bank', async () => {
    const { service, db, ledger } = build();
    db.expenseOption.findFirst = jest.fn(async () => ({ account: 'BANK' }));
    await inTenant(() => service.create(dto({ paymentType: 'UPI' })));
    expect(ledger.post.mock.calls[0][0].account).toBe('BANK');
  });

  it('posts a corrected expense again rather than leaving the books behind', async () => {
    const { service, db, ledger } = build();
    db.expense.findFirst = jest.fn(async () => ({ id: 'e1' }));
    await inTenant(() => service.update('e1', dto({ amount: 5200 })));
    // Keyed on this expense, so the correction corrects the ledger with it.
    expect(ledger.post.mock.calls[0][0]).toMatchObject({ sourceId: 'e1', amount: 5200 });
  });

  it('refuses an expense against an order that does not exist', async () => {
    const { service, db } = build();
    db.order.findFirst = jest.fn(async () => null);
    await expect(inTenant(() => service.create(dto({ orderId: 'ghost' })))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('keeps the day it was spent, whatever the server clock says', () => {
    // A DATE column and a shop in IST: read as local time, "8 September" spent
    // late in the evening becomes the 7th in the books.
    expect(dateOnly('2026-09-08').toISOString()).toBe('2026-09-08T00:00:00.000Z');
    expect(() => dateOnly('not a date')).toThrow(BadRequestException);
  });
});

describe('taking one back', () => {
  const SPENT = {
    id: 'e1',
    date: new Date('2026-09-08'),
    description: 'Router bits',
    amount: 4500,
    paymentType: 'Cash',
    doneBy: 'Nakul',
    toName: 'Sharma Tools',
    vendor: 'Self',
    spentType: 'Tooling',
    vendorGstin: '09AAACH7409R1ZZ',
    taxableValue: 3814,
    taxAmount: 686,
    itcEligible: true,
    orderId: null,
    reversalOfId: null,
    reversedBy: null,
  };

  it('records the opposite row rather than removing the first', async () => {
    const { service, db } = build();
    db.expense.findFirst = jest.fn(async () => SPENT);
    await inTenant(() => service.reverse('e1', 'Bill was for two sheets, not three', 'u1'));

    // Both rows stand: what was entered, what took it back, who and why.
    expect(db.expense.delete).not.toHaveBeenCalled();
    expect(db.expense.create.mock.calls[0][0].data).toMatchObject({
      amount: -4500,
      reversalOfId: 'e1',
      reason: 'Bill was for two sheets, not three',
      createdById: 'u1',
    });
  });

  it('brings the tax back with it', async () => {
    const { service, db } = build();
    db.expense.findFirst = jest.fn(async () => SPENT);
    await inTenant(() => service.reverse('e1', 'Never happened'));
    // Otherwise the accountant claims credit on a bill the shop has just said
    // it never paid.
    expect(db.expense.create.mock.calls[0][0].data).toMatchObject({
      taxableValue: -3814,
      taxAmount: -686,
    });
  });

  it('posts the correction, so the drawer follows it', async () => {
    const { service, db, ledger } = build();
    db.expense.findFirst = jest.fn(async () => SPENT);
    await inTenant(() => service.reverse('e1', 'Never happened'));
    expect(ledger.post).toHaveBeenCalled();
  });

  it('will not take the same expense back twice', async () => {
    const { service, db } = build();
    db.expense.findFirst = jest.fn(async () => ({ ...SPENT, reversedBy: { id: 'e2' } }));
    await expect(
      inTenant(() => service.reverse('e1', 'Never happened')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('will not reverse a correction, because that is spending it again', async () => {
    const { service, db } = build();
    db.expense.findFirst = jest.fn(async () => ({ ...SPENT, reversalOfId: 'e0' }));
    await expect(
      inTenant(() => service.reverse('e1', 'Never happened')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('insists on a reason, because a figure that moved is owed an explanation', async () => {
    const { service, db } = build();
    db.expense.findFirst = jest.fn(async () => SPENT);
    await expect(inTenant(() => service.reverse('e1', '  '))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses one that is not there', async () => {
    const { service, db } = build();
    db.expense.findFirst = jest.fn(async () => null);
    await expect(
      inTenant(() => service.reverse('ghost', 'Never happened')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('the story an expense keeps', () => {
  it('opens with the row being created', async () => {
    const { service, db } = build();
    await inTenant(() => service.create(dto(), 'u1'));
    expect(db.expenseEditHistory.create.mock.calls[0][0].data).toMatchObject({
      expenseId: 'e1',
      editType: 'CREATED',
      changes: [],
    });
  });

  it('copies the name of whoever did it, not only their id', async () => {
    const { service, db } = build();
    db.user.findFirst = jest.fn(async () => ({ name: 'Nakul' }));
    await inTenant(() => service.create(dto(), 'u1'));
    // The moment somebody most wants to read who corrected an expense is often
    // after that person has left and their account has gone.
    expect(db.expenseEditHistory.create.mock.calls[0][0].data).toMatchObject({
      userId: 'u1',
      userName: 'Nakul',
    });
  });

  it('says what changed, and keeps the reason typed at the time', async () => {
    const { service, db } = build();
    db.expense.findFirst = jest.fn(async () => ({ ...SPEND_ROW, amount: 4500 }));
    await inTenant(() =>
      service.update('e1', dto({ amount: 5200, editNote: 'Two sheets, not three' })),
    );
    const written = db.expenseEditHistory.create.mock.calls[0][0].data;
    expect(written.editType).toBe('UPDATED');
    expect(written.note).toBe('Two sheets, not three');
    expect(written.changes).toEqual([{ field: 'amount', from: 4500, to: 5200 }]);
  });

  it('writes nothing when a save changed nothing', async () => {
    const { service, db } = build();
    db.expense.findFirst = jest.fn(async () => SPEND_ROW);
    await inTenant(() => service.update('e1', dto()));
    // A log of edits that changed no field is a log nobody reads twice.
    expect(db.expenseEditHistory.create).not.toHaveBeenCalled();
  });

  it('will not edit a correction, only the row it corrects', async () => {
    const { service, db } = build();
    db.expense.findFirst = jest.fn(async () => ({ ...SPEND_ROW, reversalOfId: 'e0' }));
    await expect(inTenant(() => service.update('e1', dto()))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('what counts as a change', () => {
  it('sees a corrected amount however Prisma handed the old one back', () => {
    // A Decimal and the number replacing it must compare equal, or every save
    // would claim the amount changed.
    expect(diffExpense({ amount: { toString: () => '4500' } }, { amount: 4500 })).toEqual([]);
    expect(diffExpense({ amount: { toString: () => '4500' } }, { amount: 5200 })).toEqual([
      { field: 'amount', from: 4500, to: 5200 },
    ]);
  });

  it('reads a date as the day it means', () => {
    expect(
      diffExpense({ date: new Date('2026-09-08') }, { date: new Date('2026-09-09') }),
    ).toEqual([{ field: 'date', from: '2026-09-08', to: '2026-09-09' }]);
  });

  it('treats a cleared field as a change to nothing', () => {
    expect(diffExpense({ note: 'Short delivery' }, { note: null })).toEqual([
      { field: 'note', from: 'Short delivery', to: null },
    ]);
  });

  it('says nothing about the columns nobody edited', () => {
    // `updatedAt` moves on every save; saying so in the history is noise.
    expect(diffExpense({ updatedAt: new Date('2026-01-01') }, {})).toEqual([]);
  });
});

describe('which account a way of paying comes out of', () => {
  it('believes the shop before it believes the label', () => {
    // "Petty cash" is cash and "Cash card" is not, and only the shop knows.
    expect(accountForPaymentType('Cash card', { account: 'BANK' as never })).toBe('BANK');
    expect(accountForPaymentType('Owner settles it', { account: 'CASH' as never })).toBe(
      'CASH',
    );
  });

  it('guesses only when nobody has said', () => {
    expect(accountForPaymentType('Petty Cash')).toBe('CASH');
    expect(accountForPaymentType('UPI')).toBe('BANK');
    expect(accountForPaymentType('Cash', { account: null })).toBe('CASH');
  });
});

describe('the dropdowns the shop keeps', () => {
  it('offers every field, even the ones nothing has been added to', async () => {
    const { service, db } = build();
    db.expenseOption.findMany = jest.fn(async () => [
      { field: 'PAYMENT_TYPE', label: 'Cash' },
      { field: 'SPENT_TYPE', label: 'Rent' },
    ]);
    const options = await service.optionsForForm();
    // A form asking for a vendor with no `vendor` key crashes rather than
    // showing an empty list.
    expect(options).toEqual({
      PAYMENT_TYPE: ['Cash'],
      DONE_BY: [],
      VENDOR: [],
      SPENT_TYPE: ['Rent'],
      TO_NAME: [],
    });
  });

  it('adds a new option at the bottom of its own list', async () => {
    const { service, db } = build();
    db.expenseOption.findFirst = jest.fn(async () => ({ sortOrder: 40 }));
    await inTenant(() => service.createOption({ field: 'SPENT_TYPE', label: ' Diesel ' } as never));
    expect(db.expenseOption.create.mock.calls[0][0].data).toMatchObject({
      label: 'Diesel',
      sortOrder: 50,
    });
  });

  it('only lets a way of paying name an account', async () => {
    const { service, db } = build();
    db.expenseOption.findFirst = jest.fn(async () => null);
    await inTenant(() =>
      service.createOption({
        field: 'SPENT_TYPE',
        label: 'Rent',
        account: 'CASH',
      } as never),
    );
    // A category of spending does not come out of a drawer; claiming it does
    // would put a second, wrong answer beside the payment type's.
    expect(db.expenseOption.create.mock.calls[0][0].data.account).toBeNull();
  });

  it('retires an option rather than deleting it', async () => {
    const { service, db } = build();
    db.expenseOption.findFirst = jest.fn(async () => ({ id: 'o1' }));
    await service.removeOption('o1');
    expect(db.expenseOption.update.mock.calls[0][0].data).toEqual({ isActive: false });
    expect(db.expenseOption.delete).not.toHaveBeenCalled();
  });

  it('will not reorder a list using ids from another one', async () => {
    const { service, db } = build();
    db.expenseOption.findMany = jest.fn(async () => [{ id: 'o1' }]);
    await expect(
      service.reorderOptions({ field: 'VENDOR', orderedIds: ['o1', 'o2'] } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('says plainly when a label is already on the list', async () => {
    const { service, db } = build();
    db.expenseOption.findFirst = jest.fn(async () => null);
    db.expenseOption.create = jest.fn(async () => {
      throw Object.assign(new Error('unique'), { code: 'P2002' });
    });
    await expect(
      inTenant(() => service.createOption({ field: 'VENDOR', label: 'Shop' } as never)),
    ).rejects.toThrow();
  });
});

describe('what a view of the expenses covers', () => {
  it('narrows on each label it was given', () => {
    const where = expenseFilter({ spentType: 'Rent', doneBy: 'Nakul' });
    expect(where).toMatchObject({ spentType: 'Rent', doneBy: 'Nakul' });
  });

  it('searches what a person would type', () => {
    const where = expenseFilter({ search: 'diesel' });
    expect(JSON.stringify(where.OR)).toContain('description');
    expect(JSON.stringify(where.OR)).toContain('toName');
  });

  it('windows on the day the money was spent', () => {
    const where = expenseFilter({ from: '2026-09-01', to: '2026-09-30' });
    expect(where.date).toEqual({
      gte: new Date('2026-09-01T00:00:00.000Z'),
      lte: new Date('2026-09-30T00:00:00.000Z'),
    });
  });

  it('totals the whole filtered set rather than the page on screen', async () => {
    const { service, db } = build();
    db.expense.findMany = jest.fn(async () => []);
    db.expense.count = jest.fn(async () => 120);
    db.expense.aggregate = jest.fn(async () => ({ _sum: { amount: 250000 } }));
    const page = await service.list({ page: 1, limit: 20, skip: 0 } as never);
    expect(page.total).toBe(250000);
    expect(page.meta.total).toBe(120);
  });
});

describe('cutting the spending up', () => {
  const rows = [
    { date: new Date('2026-08-04'), amount: 1000, spentType: 'Rent' },
    { date: new Date('2026-09-02'), amount: 2500, spentType: 'Tooling' },
    { date: new Date('2026-09-20'), amount: 500, spentType: 'Rent' },
  ];

  it('puts the biggest bucket first, because that is the one to look at', () => {
    expect(groupBy(rows as never, 'spentType')).toEqual([
      { label: 'Tooling', amount: 2500, count: 1 },
      { label: 'Rent', amount: 1500, count: 2 },
    ]);
  });

  it('runs the months oldest first, so a trend reads left to right', () => {
    expect(monthlySeries(rows as never)).toEqual([
      { month: '2026-08', amount: 1000 },
      { month: '2026-09', amount: 3000 },
    ]);
  });
});

describe('the posting itself', () => {
  it('carries what an accountant needs off the expense', () => {
    const posting = expensePosting(
      {
        id: 'e1',
        date: new Date('2026-09-08'),
        amount: 11800,
        description: 'Sheet stock',
        spentType: 'Raw material',
        toName: 'Verma Ply',
        vendor: 'Self',
        vendorGstin: '09AAACH7409R1ZZ',
        taxAmount: 1800,
        note: null,
        orderId: 'o1',
        createdById: 'u1',
      },
      'CASH' as never,
    );
    expect(posting).toMatchObject({
      voucher: 'PAYMENT',
      accountHead: 'Raw material',
      gstin: '09AAACH7409R1ZZ',
      taxAmount: 1800,
      orderId: 'o1',
      // The description stands in when nobody wrote a note, so a ledger line
      // is never blank.
      note: 'Sheet stock',
    });
  });
});

describe('the bill photographed at the counter', () => {
  it('stores it as a size image, because a bill is read rather than looked at', async () => {
    const { service, db, files } = build();
    db.expense.findFirst = jest.fn(async () => ({ id: 'e1' }));
    await service.attachBill('e1', { originalname: 'bill.jpg' } as never, 'u1');
    // The harder compression that suits a picture of a finished panel turns a
    // printed rate into a smudge.
    expect(files.ingest.mock.calls[0][1]).toBe('SIZE_IMAGE');
    expect(db.expense.update.mock.calls[0][0].data).toEqual({ billFileId: 'f1' });
  });

  it('unpins a bill without destroying the file', async () => {
    const { service, db } = build();
    db.expense.findFirst = jest.fn(async () => ({ id: 'e1' }));
    await service.removeBill('e1');
    expect(db.expense.update.mock.calls[0][0].data).toEqual({ billFileId: null });
    expect(db.storedFile.delete).not.toHaveBeenCalled();
  });

  it('refuses to attach a bill to an expense that is not there', async () => {
    const { service, db } = build();
    db.expense.findFirst = jest.fn(async () => null);
    await expect(service.attachBill('ghost', {} as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
