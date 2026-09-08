import { NotificationsService } from './notifications.service';
import { inTenant, prismaMock } from '../../../test/prisma-mock';

type Db = Record<string, Record<string, jest.Mock>>;

function build(options: { users?: unknown[]; override?: unknown } = {}) {
  const db = prismaMock() as never as Db;
  db.user.findMany = jest.fn(async () => options.users ?? [{ id: 'u1' }, { id: 'u2' }]);
  db.notificationTemplate.findFirst = jest.fn(async () => options.override ?? null);
  db.notification.createMany = jest.fn(async ({ data }: { data: unknown[] }) => ({
    count: data.length,
  }));
  return { service: new NotificationsService(db as never), db };
}

const move = {
  entity: 'Order',
  entityId: 'o1',
  actorId: 'u9',
  values: { order: 'ORD-1', stage: 'Cutting', client: 'Verma Interiors', who: 'Rajat' },
};

describe('raising one', () => {
  it('writes a row for each person it is for', async () => {
    const { service, db } = build();
    expect(await inTenant(() => service.raise('order.moved', move))).toBe(2);

    const rows = db.notification.createMany.mock.calls[0][0].data;
    expect(rows.map((row: { userId: string }) => row.userId)).toEqual(['u1', 'u2']);
  });

  it('picks people by permission, not by role name', async () => {
    const { service, db } = build();
    await inTenant(() => service.raise('payment.recorded', { values: {} }));

    // Somebody who cannot see payments should not be told one was taken.
    expect(db.user.findMany.mock.calls[0][0].where).toMatchObject({
      isActive: true,
      roleRef: { permissions: { has: 'payment.view' } },
    });
  });

  it('does not tell somebody about their own doing', async () => {
    const { service, db } = build();
    await inTenant(() => service.raise('order.moved', move));
    expect(db.user.findMany.mock.calls[0][0].where.id).toEqual({ not: 'u9' });
  });

  it('writes the words as they read now, and keeps them', async () => {
    const { service, db } = build();
    await inTenant(() => service.raise('order.moved', move));

    const row = db.notification.createMany.mock.calls[0][0].data[0];
    expect(row.title).toBe('ORD-1 → Cutting');
    // Editing the wording later must not rewrite what people were told.
    expect(row.body).toBe('Rajat moved ORD-1 to Cutting for Verma Interiors.');
  });

  it('uses the shop’s own wording where they set some', async () => {
    const { service, db } = build({
      override: { key: 'order.moved', title: '{order} is now {stage}', body: null, enabled: true },
    });
    await inTenant(() => service.raise('order.moved', move));
    expect(db.notification.createMany.mock.calls[0][0].data[0].title).toBe('ORD-1 is now Cutting');
  });

  it('says nothing at all when the shop switched it off', async () => {
    const { service, db } = build({
      override: { key: 'order.moved', enabled: false },
    });
    expect(await inTenant(() => service.raise('order.moved', move))).toBe(0);
    // A notification nobody wants is worse than none.
    expect(db.notification.createMany).not.toHaveBeenCalled();
  });

  it('ignores a key the product does not have', async () => {
    const { service, db } = build();
    expect(await inTenant(() => service.raise('nothing.here', { values: {} }))).toBe(0);
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it('writes nothing when nobody is eligible', async () => {
    const { service, db } = build({ users: [] });
    expect(await inTenant(() => service.raise('order.moved', move))).toBe(0);
    expect(db.notification.createMany).not.toHaveBeenCalled();
  });

  it('never throws, whatever went wrong', async () => {
    const { service, db } = build();
    db.notification.createMany = jest.fn(async () => {
      throw new Error('table is gone');
    });
    jest.spyOn(require('@nestjs/common').Logger.prototype, 'warn').mockImplementation(() => undefined);

    // A shop must not be unable to move an order because telling somebody
    // about it failed.
    await expect(inTenant(() => service.raise('order.moved', move))).resolves.toBe(0);
    jest.restoreAllMocks();
  });

  it('points at what it is about, so tapping it can open the thing', async () => {
    const { service, db } = build();
    await inTenant(() => service.raise('order.moved', move));
    expect(db.notification.createMany.mock.calls[0][0].data[0]).toMatchObject({
      entity: 'Order',
      entityId: 'o1',
    });
  });
});

describe('reading them', () => {
  it('asks only for the reader’s own, newest first', async () => {
    const { service, db } = build();
    db.notification.findMany = jest.fn(async () => []);
    await service.mine('u1');

    expect(db.notification.findMany.mock.calls[0][0]).toMatchObject({
      where: { userId: 'u1' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('can be narrowed to what has not been read', async () => {
    const { service, db } = build();
    db.notification.findMany = jest.fn(async () => []);
    await service.mine('u1', { unread: true });
    expect(db.notification.findMany.mock.calls[0][0].where).toMatchObject({ readAt: null });
  });

  it('marks one read only for the person reading it', async () => {
    const { service, db } = build();
    db.notification.updateMany = jest.fn(async () => ({ count: 1 }));
    await service.markRead('u1', 'n1');

    // One row per person, so read state is theirs alone.
    expect(db.notification.updateMany.mock.calls[0][0].where).toEqual({ id: 'n1', userId: 'u1' });
  });

  it('refuses to mark somebody else’s', async () => {
    const { service, db } = build();
    db.notification.updateMany = jest.fn(async () => ({ count: 0 }));
    await expect(service.markRead('u1', 'someone-elses')).rejects.toThrow(/No such notification/);
  });

  it('clears the lot', async () => {
    const { service, db } = build();
    db.notification.updateMany = jest.fn(async () => ({ count: 9 }));
    expect(await service.markAllRead('u1')).toEqual({ read: 9 });
    expect(db.notification.updateMany.mock.calls[0][0].where).toEqual({
      userId: 'u1',
      readAt: null,
    });
  });
});

describe('the wording', () => {
  it('lists every trigger the product has', async () => {
    const { service, db } = build();
    db.notificationTemplate.findMany = jest.fn(async () => []);

    const settings = await service.settings();
    expect(settings.length).toBeGreaterThan(5);
    expect(settings.every((setting) => setting.enabled)).toBe(true);
    expect(settings.every((setting) => !setting.overridden)).toBe(true);
  });

  it('shows a shop’s own words where they wrote some', async () => {
    const { service, db } = build();
    db.notificationTemplate.findMany = jest.fn(async () => [
      { key: 'order.moved', title: 'Custom', body: null, enabled: true },
    ]);

    const setting = (await service.settings()).find((one) => one.key === 'order.moved')!;
    expect(setting.title).toBe('Custom');
    expect(setting.overridden).toBe(true);
  });

  it('treats an empty title as "use the product’s words"', async () => {
    const { service, db } = build();
    db.notificationTemplate.findFirst = jest.fn(async () => null);
    db.notificationTemplate.findMany = jest.fn(async () => []);

    await inTenant(() => service.saveSetting('order.moved', { title: '   ' }));
    // Rather than as "say nothing".
    expect(db.notificationTemplate.create.mock.calls[0][0].data.title).toBeNull();
  });

  it('refuses a key the product does not have', async () => {
    const { service } = build();
    await expect(inTenant(() => service.saveSetting('nope.nope', {}))).rejects.toThrow(
      /No notification called/,
    );
  });
});
