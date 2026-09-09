import { auditExtension, changed, redact } from './audit.extension';
import { runAsActor, withAuditNote } from './audit-context';

type Row = Record<string, unknown>;

/**
 * A stand-in for the tenant-scoped client the extension writes through, plus
 * the one hook Prisma gives an extension: the operation it is wrapping.
 */
function build(rows: Row[] = []) {
  const written: Row[] = [];
  const table = () => ({
    findUnique: jest.fn(async ({ where }: { where: Row }) =>
      rows.find((row) => row.id === where.id) ?? null,
    ),
    findMany: jest.fn(async () => rows),
  });

  const client: Record<string, Record<string, jest.Mock>> = {
    orderItem: table(),
    order: {
      findUnique: jest.fn(async ({ where }: { where: Row }) =>
        rows.find((row) => row.id === where.id) ?? null,
      ),
      findMany: jest.fn(async () => rows),
    },
    auditLog: {
      create: jest.fn(async ({ data }: { data: Row }) => {
        written.push(data);
        return data;
      }),
    },
  };

  const extension = auditExtension(client, 'tenant-1');
  const run = (
    operation: string,
    args: unknown,
    result: unknown,
    model = 'Order',
  ) =>
    extension.query.$allModels.$allOperations({
      model,
      operation,
      args,
      query: async () => result,
    });

  return { run, written, client };
}

describe('what the trail records', () => {
  it('records a new order with what it was punched as', async () => {
    const { run, written } = build();
    await run('create', { data: { code: 'ORD-1' } }, { id: 'o1', code: 'ORD-1', total: 500 });

    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({
      entity: 'Order',
      entityId: 'o1',
      entityCode: 'ORD-1',
      action: 'order.created',
    });
    expect(written[0].after).toMatchObject({ code: 'ORD-1', total: 500 });
  });

  it('records only what changed', async () => {
    const { run, written } = build([{ id: 'o1', code: 'ORD-1', rate: 100, note: 'same' }]);
    await run(
      'update',
      { where: { id: 'o1' } },
      { id: 'o1', code: 'ORD-1', rate: 250, note: 'same' },
    );

    // A whole-row copy makes a history nobody reads.
    expect(written[0].before).toEqual({ rate: 100 });
    expect(written[0].after).toEqual({ rate: 250 });
  });

  it('says nothing when an update changed nothing', async () => {
    const { run, written } = build([{ id: 'o1', rate: 100 }]);
    await run('update', { where: { id: 'o1' } }, { id: 'o1', rate: 100 });
    expect(written).toEqual([]);
  });

  it('keeps the whole row when something is deleted', async () => {
    const { run, written } = build([{ id: 'o1', code: 'ORD-1', total: 900 }]);
    await run('delete', { where: { id: 'o1' } }, { id: 'o1' });

    // Nothing else will hold it afterwards.
    expect(written[0].action).toBe('order.deleted');
    expect(written[0].before).toMatchObject({ code: 'ORD-1', total: 900 });
    expect(written[0].after).toBeUndefined();
  });

  it('names who did it', async () => {
    const { run, written } = build();
    await runAsActor({ userId: 'u1', name: 'Rajat', code: 'NV-02' }, () =>
      run('create', { data: {} }, { id: 'o1' }),
    );

    expect(written[0]).toMatchObject({ userId: 'u1', actorLabel: 'Rajat' });
  });

  it('names a platform admin without pointing at a user that is not there', async () => {
    const { run, written } = build();
    await runAsActor({ name: 'Nakul (FirstLeap support)' }, () =>
      run('create', { data: {} }, { id: 'o1' }),
    );

    // Their id belongs to another database entirely.
    expect(written[0].userId).toBeNull();
    expect(written[0].actorLabel).toBe('Nakul (FirstLeap support)');
  });

  it('keeps the reason somebody gave', async () => {
    const { run, written } = build([{ id: 'o1', statusId: 's2' }]);
    await withAuditNote({ reason: 'Client changed the design', action: 'order.moved_back' }, () =>
      run('update', { where: { id: 'o1' } }, { id: 'o1', statusId: 's1' }),
    );

    expect(written[0]).toMatchObject({
      action: 'order.moved_back',
      reason: 'Client changed the design',
    });
  });

  it('leaves reads alone', async () => {
    const { run, written, client } = build();
    await run('findMany', {}, []);
    expect(written).toEqual([]);
    expect(client.order.findUnique).not.toHaveBeenCalled();
  });

  it('leaves the trail itself alone', async () => {
    const { run, written } = build();
    await run('create', { data: {} }, { id: 'a1' }, 'AuditLog');
    expect(written).toEqual([]);
  });

  it('summarises a bulk write rather than writing hundreds of rows', async () => {
    const many = Array.from({ length: 250 }, (_, index) => ({ id: `o${index}` }));
    const { run, written } = build(many);
    await run('updateMany', { where: {} }, { count: 250 });

    expect(written).toHaveLength(1);
    expect(written[0].after).toEqual({ affected: 250 });
  });

  it('records each row of a small bulk delete', async () => {
    const { run, written } = build([
      { id: 'o1', code: 'ORD-1' },
      { id: 'o2', code: 'ORD-2' },
    ]);
    await run('deleteMany', { where: { clientId: 'c1' } }, { count: 2 });

    expect(written.map((row) => row.entityCode)).toEqual(['ORD-1', 'ORD-2']);
  });

  it('lets the change stand when the trail cannot be written', async () => {
    const { run, client } = build();
    client.auditLog.create = jest.fn(async () => {
      throw new Error('log table is full');
    });
    jest.spyOn(require('@nestjs/common').Logger.prototype, 'error').mockImplementation(() => undefined);

    // A shop that cannot punch an order because a log table is full is worse
    // than a gap in the log.
    await expect(run('create', { data: {} }, { id: 'o1' })).resolves.toMatchObject({ id: 'o1' });
    jest.restoreAllMocks();
  });
});

describe('what a change belongs to', () => {
  it('hangs a line off the order it is on', async () => {
    const { run, written } = build([{ id: 'i1', orderId: 'o1', rate: 100 }]);
    await run('update', { where: { id: 'i1' } }, { id: 'i1', orderId: 'o1', rate: 150 }, 'OrderItem');

    // Otherwise an order's history shows its own columns changing and nothing
    // about the line whose rate was corrected.
    expect(written[0]).toMatchObject({ rootEntity: 'Order', rootId: 'o1' });
  });

  it('reads the owner off the row, not off what was asked for', async () => {
    const { run, written } = build([{ id: 'i1', orderId: 'o1', rate: 100 }]);
    // An update that never mentions the order still belongs to it.
    await run('delete', { where: { id: 'i1' } }, { id: 'i1' }, 'OrderItem');
    expect(written[0]).toMatchObject({ rootId: 'o1' });
  });

  it('leaves it empty for something that stands on its own', async () => {
    const { run, written } = build();
    await run('create', { data: {} }, { id: 'o1' });
    expect(written[0]).toMatchObject({ rootEntity: null, rootId: null });
  });
});

describe('what never reaches the trail', () => {
  it('drops file bytes, password hashes and connection strings', () => {
    const out = redact({
      id: 'f1',
      data: Buffer.from('a photo'),
      passwordHash: '$2a$10$abcdef',
      databaseUrl: 'postgresql://someone-elses-shop',
      name: 'keep me',
    });

    expect(out).toEqual({ id: 'f1', name: 'keep me' });
  });

  it('summarises text too long to be worth copying', () => {
    const long = 'x'.repeat(2000);
    const out = redact({ notes: long }) as { notes: string };
    expect(out.notes.length).toBeLessThan(600);
    expect(out.notes).toContain('2000 characters');
  });

  it('ignores the columns that change on their own', () => {
    expect(
      changed(
        { id: 'o1', updatedAt: new Date('2026-01-01'), tenantId: 't1', rate: 5 },
        { id: 'o1', updatedAt: new Date('2026-02-02'), tenantId: 't1', rate: 5 },
      ),
    ).toBeNull();
  });

  it('compares what a Decimal says, not what it is', () => {
    // Prisma hands back Decimal objects; two of them are never ===.
    const decimal = (value: string) => ({ toString: () => value });
    expect(changed({ rate: decimal('100') }, { rate: decimal('100') })).toBeNull();
    expect(changed({ rate: decimal('100') }, { rate: decimal('120') })).not.toBeNull();
  });
});
