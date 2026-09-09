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


/*
 * Ours looks exactly like a paying client from here — ACTIVE, on a tier, every
 * module — and that is the trap. A revenue figure that includes ourselves is a
 * figure that lies, and it lies upward, which is the direction nobody checks.
 */
describe('a workspace of our own', () => {
  const withRows = (tenants: Record<string, unknown>[]) => {
    const { service, db } = build();
    db.tenant.findMany = jest.fn(async () => tenants);
    db.subscriptionTier.findMany = jest.fn(async () => [
      {
        key: 'shop',
        label: 'Shop',
        blurb: '',
        monthlyPrice: 8000,
        includedModules: ['orders', 'clients', 'leads', 'quotes', 'finance'],
        isActive: true,
        sortOrder: 10,
      },
      {
        key: 'works',
        label: 'Works',
        blurb: '',
        monthlyPrice: 15000,
        includedModules: ['orders', 'clients'],
        isActive: true,
        sortOrder: 20,
      },
      {
        key: 'punch',
        label: 'Punch',
        blurb: '',
        monthlyPrice: 3000,
        includedModules: ['orders', 'clients'],
        isActive: true,
        sortOrder: 0,
      },
    ]);
    return service;
  };

  const CLIENT = {
    id: 't1',
    name: 'Decor Bucket',
    slug: 'decorbucket',
    status: 'ACTIVE',
    plan: 'shop',
    modules: [],
    isInternal: false,
    trialEndsAt: null,
    billingDay: 5,
    createdAt: new Date(),
  };

  const OURS = {
    ...CLIENT,
    id: 't2',
    name: 'FLT',
    slug: 'flt',
    plan: 'works',
    isInternal: true,
  };

  it('is left out of what is recurring', async () => {
    const billing = await withRows([CLIENT, OURS]).billing();

    expect(billing.totals.monthlyRecurring).toBe(8000);
    expect(billing.totals.paying).toBe(1);
  });

  it('is counted as ours instead', async () => {
    const billing = await withRows([CLIENT, OURS]).billing();

    expect(billing.totals.internal).toBe(1);
  });

  // Hiding it entirely loses the answer to "what would we charge for this".
  it('still says what it would be worth', async () => {
    const billing = await withRows([CLIENT, OURS]).billing();
    const ours = billing.rows.find((row) => row.slug === 'flt')!;

    expect(ours.monthlyTotal).toBe(15000);
    expect(ours.isInternal).toBe(true);
  });

  // Every one of these is a thing somebody must act on. Ours is not.
  it('never appears in what needs doing', async () => {
    const billing = await withRows([
      { ...OURS, status: 'TRIAL', trialEndsAt: new Date(Date.now() - 86400000) },
    ]).billing();

    expect(billing.needsAttention.trialsExpired).toEqual([]);
    expect(billing.needsAttention.trialsEndingSoon).toEqual([]);
    expect(billing.needsAttention.trialsWithNoEnd).toEqual([]);
    expect(billing.needsAttention.payingNothing).toEqual([]);
  });

  it('does not hide a client’s expired trial along with it', async () => {
    const billing = await withRows([
      { ...CLIENT, status: 'TRIAL', trialEndsAt: new Date(Date.now() - 86400000) },
      OURS,
    ]).billing();

    expect(billing.needsAttention.trialsExpired.map((one) => one.name)).toEqual(['Decor Bucket']);
  });

  it('bills a client on a priced tier what the tier says', async () => {
    const billing = await withRows([CLIENT]).billing();

    expect(billing.rows[0].monthlyTotal).toBe(8000);
  });
});


/*
 * The dashboard and the billing screen answer the same question, and once
 * gave different answers: the billing screen left our own workspace out of
 * revenue and the dashboard did not. They share one function now, and this is
 * the rail that says so.
 */
describe('the dashboard and the billing screen agree', () => {
  const TENANTS = [
    {
      id: 't1',
      slug: 'decorbucket',
      name: 'Decor Bucket',
      plan: 'shop',
      modules: [],
      status: 'ACTIVE',
      isolation: 'SHARED',
      isInternal: false,
      billingDay: 7,
      trialEndsAt: null,
      contactName: 'Nakul',
      createdAt: new Date(),
    },
    {
      id: 't2',
      slug: 'flt',
      name: 'FLT',
      plan: 'shop',
      modules: [],
      status: 'ACTIVE',
      isolation: 'SHARED',
      isInternal: true,
      billingDay: 9,
      trialEndsAt: null,
      contactName: 'FirstLeap',
      createdAt: new Date(),
    },
  ];

  const both = async () => {
    const { service, db } = build();
    db.tenant.findMany = jest.fn(async () => TENANTS);
    db.subscriptionTier.findMany = jest.fn(async () => [
      {
        key: 'shop',
        label: 'Shop',
        blurb: '',
        monthlyPrice: 8000,
        includedModules: ['orders', 'clients'],
        isActive: true,
        sortOrder: 10,
      },
    ]);
    return { overview: await service.overview(), billing: await service.billing() };
  };

  it('reports the same monthly recurring', async () => {
    const { overview, billing } = await both();

    expect(overview.totals.monthlyRecurring).toBe(billing.totals.monthlyRecurring);
    expect(overview.totals.monthlyRecurring).toBe(8000);
  });

  it('counts the same number of paying clients', async () => {
    const { overview, billing } = await both();

    expect(overview.totals.paying).toBe(billing.totals.paying);
    expect(overview.totals.paying).toBe(1);
  });

  // Not merely missing from the total — said, so nobody wonders where it went.
  it('says how many are ours on both', async () => {
    const { overview, billing } = await both();

    expect(overview.totals.internal).toBe(1);
    expect(billing.totals.internal).toBe(1);
  });

  it('still lists ours, with what it would be worth', async () => {
    const { overview } = await both();
    const ours = overview.workspaces.find((one) => one.slug === 'flt')!;

    expect(ours.isInternal).toBe(true);
    expect(ours.bill.monthlyTotal).toBe(8000);
  });
});


/*
 * The seed used to re-read and recurse without a bound. Fine while the write
 * always lands, and a process-killing hang when it does not — a read replica a
 * moment behind, a transaction rolled back.
 */
describe('seeding the tiers that ship with the product', () => {
  it('writes the ones that are missing', async () => {
    const { service, db } = build();
    await service.tiers();

    expect(db.subscriptionTier.createMany).toHaveBeenCalled();
  });

  it('gives up rather than looping when the write does not come back', async () => {
    const { service, db } = build();
    // findMany keeps returning nothing, however many times it is asked.
    db.subscriptionTier.findMany = jest.fn(async () => []);

    await expect(service.tiers()).resolves.toEqual([]);
    expect(db.subscriptionTier.findMany).toHaveBeenCalledTimes(2);
  });
});
