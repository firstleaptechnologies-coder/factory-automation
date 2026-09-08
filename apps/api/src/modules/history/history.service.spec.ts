import { HistoryService } from './history.service';
import { prismaMock } from '../../../test/prisma-mock';

type Db = Record<string, Record<string, jest.Mock>>;

const auditRow = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  createdAt: new Date('2026-09-08T10:00:00.000Z'),
  action: 'order.updated',
  entity: 'Order',
  entityId: 'o1',
  entityCode: 'ORD-1',
  before: { notes: 'old' },
  after: { notes: 'new' },
  reason: null,
  actorLabel: null,
  user: { name: 'Rajat' },
  ...over,
});

const move = (over: Record<string, unknown> = {}) => ({
  id: 'm1',
  changedAt: new Date('2026-09-08T09:00:00.000Z'),
  fromStatus: { name: 'Design' },
  toStatus: { name: 'Cutting' },
  note: null,
  reversed: false,
  changedBy: { name: 'Nakul' },
  ...over,
});

function build(audit: unknown[] = [], moves: unknown[] = []) {
  const db = prismaMock() as never as Db;
  db.auditLog.findMany = jest.fn(async () => audit);
  db.orderStatusHistory.findMany = jest.fn(async () => moves);
  db.leadStatusHistory.findMany = jest.fn(async () => moves);
  return { service: new HistoryService(db as never), db };
}

describe('an order’s history', () => {
  it('asks for the order’s own rows and everything hanging off it', async () => {
    const { service, db } = build();
    await service.forOrder('o1');

    // Without the second half, an order's history shows its own columns
    // changing and nothing about its lines or its money.
    expect(db.auditLog.findMany.mock.calls[0][0].where).toEqual({
      OR: [
        { entity: 'Order', entityId: 'o1' },
        { rootEntity: 'Order', rootId: 'o1' },
      ],
    });
  });

  it('reads a change into fields, both sides', async () => {
    const { service } = build([auditRow()]);
    const [entry] = await service.forOrder('o1');

    expect(entry).toMatchObject({ kind: 'changed', by: 'Rajat', entityCode: 'ORD-1' });
    expect(entry.changes).toEqual([{ field: 'notes', from: 'old', to: 'new' }]);
  });

  it('tells a move from an edit', async () => {
    const { service } = build([], [move()]);
    const [entry] = await service.forOrder('o1');

    expect(entry).toMatchObject({ kind: 'moved', from: 'Design', to: 'Cutting', by: 'Nakul' });
  });

  it('says when a move went backwards, and why', async () => {
    const { service } = build([], [move({ reversed: true, note: 'Client changed the design' })]);
    const [entry] = await service.forOrder('o1');

    expect(entry).toMatchObject({
      kind: 'moved',
      reversed: true,
      action: 'order.moved_back',
      reason: 'Client changed the design',
    });
  });

  it('does not say the same move twice', async () => {
    // The order row's statusId changed as part of the move, which the move row
    // already describes — in words, with the note and who did it.
    const { service } = build(
      [auditRow({ before: { statusId: 's1' }, after: { statusId: 's2' } })],
      [move()],
    );

    const entries = await service.forOrder('o1');
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('moved');
  });

  it('keeps an edit that touched the stage and something else', async () => {
    const { service } = build(
      [auditRow({ before: { statusId: 's1', notes: 'a' }, after: { statusId: 's2', notes: 'b' } })],
      [],
    );
    expect(await service.forOrder('o1')).toHaveLength(1);
  });

  it('puts the newest first, whichever source it came from', async () => {
    const { service } = build(
      [auditRow({ createdAt: new Date('2026-09-08T08:00:00.000Z') })],
      [move({ changedAt: new Date('2026-09-08T11:00:00.000Z') })],
    );

    const entries = await service.forOrder('o1');
    expect(entries.map((entry) => entry.kind)).toEqual(['moved', 'changed']);
  });

  it('names a platform admin who has no user row here', async () => {
    const { service } = build([
      auditRow({ user: null, actorLabel: 'Nakul (Decor Bucket support)' }),
    ]);
    const [entry] = await service.forOrder('o1');
    expect(entry.by).toBe('Nakul (Decor Bucket support)');
  });

  it('carries the reason somebody gave for an edit', async () => {
    const { service } = build([auditRow({ reason: 'Rate was mis-typed' })]);
    const [entry] = await service.forOrder('o1');
    expect(entry.reason).toBe('Rate was mis-typed');
  });
});

describe('the money on an order', () => {
  it('asks for what hangs off the order, not for an audit row with its id', async () => {
    const { service, db } = build();
    await service.forPayments('o1');

    // A payment's own id is not the order's; what ties them is what it belongs
    // to, which is the column the trail records for exactly this.
    expect(db.auditLog.findMany.mock.calls[0][0].where).toEqual({
      entity: { in: ['Payment', 'CashDeposit'] },
      rootId: 'o1',
    });
  });
});

describe('other things', () => {
  it('reads a quote’s history without asking for stages it does not have', async () => {
    const { service, db } = build([auditRow({ entity: 'Estimate' })]);
    await service.forEntity('Estimate', 'e1');
    expect(db.orderStatusHistory.findMany).not.toHaveBeenCalled();
  });

  it('reads an enquiry’s moves from its own table', async () => {
    const { service, db } = build([], [move()]);
    await service.forLead('l1');
    expect(db.leadStatusHistory.findMany.mock.calls[0][0].where).toEqual({ leadId: 'l1' });
  });
});
