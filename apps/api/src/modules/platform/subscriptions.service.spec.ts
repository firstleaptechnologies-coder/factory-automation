import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';

type Db = Record<string, Record<string, jest.Mock>>;

function build() {
  const db: Db = {
    subscriptionTier: {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => ({ sortOrder: 20 })),
      findUnique: jest.fn(async () => null),
      create: jest.fn(async ({ data }: never) => ({ ...(data as object), monthlyPrice: 0 })),
      update: jest.fn(async ({ data }: never) => ({ key: 'shop', ...(data as object), monthlyPrice: 0 })),
      delete: jest.fn(async () => ({ key: 'gone' })),
      createMany: jest.fn(async () => ({ count: 0 })),
    },
    tenant: { count: jest.fn(async () => 0), findMany: jest.fn(async () => []) },
    modulePrice: { findMany: jest.fn(async () => []) },
  };

  const tenants = { invalidateAll: jest.fn(), invalidate: jest.fn() };
  const service = new SubscriptionsService(
    { platform: db } as never,
    tenants as never,
  );
  return { service, db, tenants };
}

describe('writing a tier', () => {
  it('refuses a price below nothing', async () => {
    const { service } = build();
    await expect(
      service.createTier({ key: 'big', label: 'Big', monthlyPrice: -1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a module that does not exist', async () => {
    const { service } = build();
    await expect(
      service.createTier({ key: 'big', label: 'Big', includedModules: ['teleport'] }),
    ).rejects.toThrow(/no module called/);
  });

  // A key with a space in it is a key nobody can type at a sign-in screen, and
  // one that differs by case is two tiers that look like one.
  it('settles the key rather than taking it as typed', async () => {
    const { service, db } = build();
    await service.createTier({ key: '  Big Shop ', label: 'Big Shop' });

    expect(db.subscriptionTier.create.mock.calls[0][0].data.key).toBe('big-shop');
  });

  it('refuses a key already in use', async () => {
    const { service, db } = build();
    db.subscriptionTier.findUnique = jest.fn(async () => ({ key: 'shop' }));

    await expect(service.createTier({ key: 'shop', label: 'Shop' })).rejects.toThrow(
      /already a tier/,
    );
  });

  it('puts a new tier after the ones that exist', async () => {
    const { service, db } = build();
    await service.createTier({ key: 'big', label: 'Big' });

    expect(db.subscriptionTier.create.mock.calls[0][0].data.sortOrder).toBe(30);
  });
});

describe('removing a tier', () => {
  it('says so when there is no such tier', async () => {
    const { service } = build();
    await expect(service.deleteTier('ghost')).rejects.toBeInstanceOf(NotFoundException);
  });

  // The seeded three are what an unrecognised plan key falls back to. Deleting
  // one turns a bad key into no product rather than a default one.
  it('refuses to remove a seeded tier', async () => {
    const { service, db } = build();
    db.subscriptionTier.findUnique = jest.fn(async () => ({ key: 'shop' }));

    await expect(service.deleteTier('shop')).rejects.toThrow(/cannot be removed/);
  });

  it('refuses while a workspace is still on it', async () => {
    const { service, db } = build();
    db.subscriptionTier.findUnique = jest.fn(async () => ({ key: 'big' }));
    db.tenant.count = jest.fn(async () => 2);

    await expect(service.deleteTier('big')).rejects.toThrow(/2 workspaces are on this tier/);
  });

  it('removes one nobody is on', async () => {
    const { service, db } = build();
    db.subscriptionTier.findUnique = jest.fn(async () => ({ key: 'big' }));

    await service.deleteTier('big');
    expect(db.subscriptionTier.delete).toHaveBeenCalled();
  });
});

describe('editing what a tier includes', () => {
  /*
   * The whole point of the tier being a row. Without this the price list
   * changes and the product does not until somebody restarts the API, which
   * looks exactly like a screen that does not work.
   */
  it('drops the cached entitlements so the change reaches the workspaces on it', async () => {
    const { service, db, tenants } = build();
    db.subscriptionTier.findUnique = jest.fn(async () => ({ key: 'shop' }));

    await service.setTierPrice('shop', { includedModules: ['orders', 'finance'] });

    expect(tenants.invalidateAll).toHaveBeenCalled();
  });

  // A price is a billing change and reaches nobody's product, so it must not
  // throw away a cache that sits in front of every request.
  it('leaves the cache alone for a price change', async () => {
    const { service, db, tenants } = build();
    db.subscriptionTier.findUnique = jest.fn(async () => ({ key: 'shop' }));

    await service.setTierPrice('shop', { monthlyPrice: 9000 });

    expect(tenants.invalidateAll).not.toHaveBeenCalled();
  });

  it('refuses a price below nothing', async () => {
    const { service } = build();
    await expect(service.setTierPrice('shop', { monthlyPrice: -5 })).rejects.toThrow(
      /less than nothing/,
    );
  });
});

describe('what a tier change would do', () => {
  const onTier = [
    { id: 't1', name: 'Decor Bucket', slug: 'decorbucket', modules: [] },
    { id: 't2', name: 'Woodcraft', slug: 'woodcraft', modules: ['finance'] },
  ];

  const tierEffect = () => {
    const { service, db } = build();
    db.subscriptionTier.findUnique = jest.fn(async () => ({
      key: 'shop',
      includedModules: ['orders', 'finance'],
    }));
    db.tenant.findMany = jest.fn(async () => onTier);
    return service;
  };

  it('names who would lose a module, before it is saved', async () => {
    const effect = await tierEffect().effectOfTierChange('shop', ['orders']);

    expect(effect.losing).toHaveLength(1);
    expect(effect.losing[0].module).toBe('finance');
    expect(effect.losing[0].label).toBe('Finances');
  });

  /*
   * A workspace granted the module directly keeps it whatever the tier says.
   * Counting them among the losers makes the warning cry wolf, and a warning
   * that cries wolf is one nobody reads on the day it is right.
   */
  it('leaves out a workspace that was granted the module directly', async () => {
    const effect = await tierEffect().effectOfTierChange('shop', ['orders']);

    expect(effect.losing[0].workspaces.map((one) => one.name)).toEqual(['Decor Bucket']);
  });

  it('says what would be gained too', async () => {
    const effect = await tierEffect().effectOfTierChange('shop', ['orders', 'finance', 'hr']);

    expect(effect.gaining).toEqual(['hr']);
    expect(effect.losing).toEqual([]);
  });

  it('counts the workspaces on the tier', async () => {
    const effect = await tierEffect().effectOfTierChange('shop', ['orders', 'finance']);

    expect(effect.workspacesOnTier).toBe(2);
  });

  it('says so when there is no such tier', async () => {
    const { service } = build();
    await expect(service.effectOfTierChange('ghost', [])).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
