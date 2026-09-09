import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { NOT_YET_BUILT } from './report-builders';
import { inTenant, prismaMock } from '../../../test/prisma-mock';

type Db = Record<string, Record<string, jest.Mock>>;

function make() {
  const db = prismaMock() as unknown as Db;
  // Resolved, not bare: the service treats these as promises and a jest.fn()
  // with no value returns undefined.
  const storage = {
    put: jest.fn().mockResolvedValue({}),
    read: jest.fn().mockResolvedValue(Buffer.alloc(0)),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const service = new ReportsService(db as never, storage as never);
  return { service, db, storage };
}

describe('asking for a report', () => {
  // Everything refusable is refused before a row exists, so the person who
  // asked hears about it rather than a worker discovering it an hour later.
  it('refuses a report nobody has heard of, without writing a row', async () => {
    const { service, db } = make();

    await expect(inTenant(() => service.request({ kind: 'PROFIT_AFTER_TAX' }))).rejects.toThrow(
      /no report called/,
    );
    expect(db.report.create).not.toHaveBeenCalled();
  });

  it('refuses a period that ends before it starts', async () => {
    const { service, db } = make();

    await expect(
      inTenant(() => service.request({ kind: 'CASH_BOOK', from: '2027-03-31', to: '2026-04-01' })),
    ).rejects.toThrow(/ends before it starts/);
    expect(db.report.create).not.toHaveBeenCalled();
  });

  it('refuses a report that needs a period without one', async () => {
    const { service } = make();

    await expect(inTenant(() => service.request({ kind: 'GST_SUMMARY' }))).rejects.toThrow(
      /needs a period/,
    );
  });

  // Catalogued but unwritten. Queueing it would produce an empty file and an
  // afternoon spent wondering why the numbers were missing.
  //
  // Every report in the catalogue is built today, so the pending list is
  // empty — the mechanism is exercised by putting something on it rather than
  // by naming whichever report happens to be unwritten this month, which is a
  // test that quietly stops testing anything the moment it gets written.
  it('refuses a report that is catalogued but not yet built, and says so', async () => {
    const { service, db } = make();
    const pending = NOT_YET_BUILT as Record<string, string>;
    pending.CASH_BOOK = 'still to be written';

    try {
      await expect(
        inTenant(() =>
          service.request({ kind: 'CASH_BOOK', from: '2026-04-01', to: '2026-06-30' }),
        ),
      ).rejects.toThrow(/still to be written/);
      expect(db.report.create).not.toHaveBeenCalled();
    } finally {
      delete pending.CASH_BOOK;
    }
  });

  it('queues a report it can build, against the tenant asking', async () => {
    const { service, db } = make();
    db.report.create.mockResolvedValue({ id: 'r1' });

    await inTenant(() =>
      service.request({ kind: 'CASH_BOOK', from: '2026-04-01', to: '2026-06-30' }, 'u1'),
    );

    const { data } = db.report.create.mock.calls[0][0];
    expect(data).toMatchObject({
      tenantId: 'tenant-test',
      kind: 'CASH_BOOK',
      status: 'QUEUED',
      requestedById: 'u1',
    });
  });

  it('falls back to the report’s own format when none is asked for', async () => {
    const { service, db } = make();
    db.report.create.mockResolvedValue({ id: 'r1' });

    await inTenant(() =>
      service.request({ kind: 'CASH_BOOK', from: '2026-04-01', to: '2026-06-30' }),
    );

    expect(db.report.create.mock.calls[0][0].data.format).toBe('XLSX');
  });
});

describe('downloading', () => {
  it('says a report is still building rather than answering a bare not-found', async () => {
    const { service, db } = make();
    db.report.findFirst.mockResolvedValue({ status: 'GENERATING', file: null });

    await expect(inTenant(() => service.download('r1'))).rejects.toThrow(/is generating/);
  });

  // Expected, not exceptional: retention takes the bytes on purpose.
  it('tells somebody an expired report can simply be asked for again', async () => {
    const { service, db } = make();
    db.report.findFirst.mockResolvedValue({ status: 'EXPIRED', file: null });

    await expect(inTenant(() => service.download('r1'))).rejects.toThrow(/ask for it again/i);
  });

  it('names the file after the report and its period', async () => {
    const { service, db, storage } = make();
    db.report.findFirst.mockResolvedValue({
      status: 'READY',
      kind: 'PAYOUT_LEDGER',
      format: 'XLSX',
      fromDate: new Date('2026-04-01T00:00:00Z'),
      toDate: new Date('2027-03-31T00:00:00Z'),
      file: { id: 'f1' },
    });
    storage.read.mockResolvedValue(Buffer.from('x'));

    const file = await inTenant(() => service.download('r1'));

    expect(file.fileName).toBe('payout-ledger-2026-04-01-to-2027-03-31.xlsx');
  });

  it('refuses a report that does not exist', async () => {
    const { service, db } = make();
    db.report.findFirst.mockResolvedValue(null);

    await expect(inTenant(() => service.download('nope'))).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('building', () => {
  // Two workers reaching for the same report: the second must not build it
  // again and overwrite the first's file.
  it('does nothing when the claim does not take', async () => {
    const { service, db } = make();
    db.report.updateMany.mockResolvedValue({ count: 0 });

    const built = await inTenant(() => service.generateOne('r1'));

    expect(built).toBe(false);
    expect(db.report.findFirst).not.toHaveBeenCalled();
  });

  it('claims only a report that is still queued', async () => {
    const { service, db } = make();
    db.report.updateMany.mockResolvedValue({ count: 0 });

    await inTenant(() => service.generateOne('r1'));

    expect(db.report.updateMany.mock.calls[0][0].where).toMatchObject({
      id: 'r1',
      status: 'QUEUED',
    });
  });

  // A failure has to reach the person waiting, or the report sits at
  // "Building" forever and they have no idea why.
  it('records why a build failed on the row', async () => {
    const { service, db } = make();
    db.report.updateMany.mockResolvedValue({ count: 1 });
    db.report.findFirst.mockResolvedValue({ id: 'r1', kind: 'NOT_A_REPORT', format: 'XLSX' });

    const built = await inTenant(() => service.generateOne('r1'));

    expect(built).toBe(false);
    expect(db.report.update.mock.calls.at(-1)?.[0].data).toMatchObject({ status: 'FAILED' });
    expect(db.report.update.mock.calls.at(-1)?.[0].data.error).toMatch(/no builder/i);
  });
});

describe('picking up after a worker that died', () => {
  it('requeues only reports that have been generating too long', async () => {
    const { service, db } = make();
    db.report.updateMany.mockResolvedValue({ count: 2 });

    const count = await inTenant(() => service.requeueAbandoned());

    expect(count).toBe(2);
    const { where, data } = db.report.updateMany.mock.calls[0][0];
    expect(where.status).toBe('GENERATING');
    expect(where.startedAt.lt).toBeInstanceOf(Date);
    expect(data.status).toBe('QUEUED');
  });
});

describe('retention', () => {
  // The file is a convenience; the record that somebody produced it is not.
  it('drops the bytes and keeps the row', async () => {
    const { service, db, storage } = make();
    db.report.findMany.mockResolvedValue([{ id: 'r1', fileId: 'f1', file: { id: 'f1' } }]);

    const result = await inTenant(() => service.expire());

    expect(storage.delete).toHaveBeenCalled();
    expect(db.storedFile.delete).toHaveBeenCalledWith({ where: { id: 'f1' } });
    expect(db.report.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { status: 'EXPIRED', fileId: null },
    });
    expect(db.report.delete).not.toHaveBeenCalled();
    expect(result).toEqual({ expired: 1, filesRemoved: 1 });
  });
});
