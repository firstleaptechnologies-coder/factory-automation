import {
  ALL_MODULES,
  CORE_MODULES,
  DEFAULT_PLAN,
  MODULE_CATALOGUE,
  MODULES,
  PLANS,
  hasModule,
  modulesFor,
  planFor,
} from './modules';

describe('the catalogue', () => {
  it('describes every module there is', () => {
    expect(MODULE_CATALOGUE.map((module) => module.key).sort()).toEqual([...ALL_MODULES].sort());
  });

  it('says which are named but not built yet', () => {
    const built = MODULE_CATALOGUE.filter((module) => !module.comingSoon).map((m) => m.key);
    // Nothing that ships today should be marked as coming.
    expect(built).toEqual(
      expect.arrayContaining([MODULES.ORDERS, MODULES.CLIENTS, MODULES.LEADS, MODULES.QUOTES, MODULES.FINANCE]),
    );
  });
});

describe('the plans', () => {
  it('all include the core, whatever they cost', () => {
    for (const plan of PLANS) {
      // A shop with no orders and no clients has bought nothing at all.
      for (const core of CORE_MODULES) expect(plan.modules).toContain(core);
    }
  });

  it('has a top one that holds everything', () => {
    expect(planFor('works').modules.sort()).toEqual([...ALL_MODULES].sort());
  });

  it('falls back to the default rather than to nothing', () => {
    // An unknown plan on a tenant row must not lock a shop out of the product.
    expect(planFor('nonsense').key).toBe(DEFAULT_PLAN);
    expect(planFor(null).key).toBe(DEFAULT_PLAN);
  });
});

describe('what a workspace can reach', () => {
  it('is what their plan holds', () => {
    expect(modulesFor('punch')).toEqual([MODULES.ORDERS, MODULES.CLIENTS]);
  });

  it('includes the core even for a plan that forgot it', () => {
    expect(modulesFor('punch')).toContain(MODULES.CLIENTS);
  });

  it('adds anything granted on top', () => {
    // A shop that wants one thing from the next tier should not have to buy
    // the tier.
    expect(modulesFor('punch', [MODULES.HR])).toContain(MODULES.HR);
  });

  it('ignores an extra that is not a module', () => {
    expect(modulesFor('punch', ['nonsense'])).toEqual([MODULES.ORDERS, MODULES.CLIENTS]);
  });

  it('never repeats one', () => {
    const modules = modulesFor('works', [MODULES.HR, MODULES.HR]);
    expect(new Set(modules).size).toBe(modules.length);
  });

  it('comes back in a stable order, whatever it was given', () => {
    // The menu is built from this; it should not shuffle between tenants.
    expect(modulesFor('shop', [MODULES.AI, MODULES.HR])).toEqual(
      modulesFor('shop', [MODULES.HR, MODULES.AI]),
    );
  });
});

describe('asking whether a workspace has one', () => {
  it('says yes to what they bought', () => {
    expect(hasModule(['orders', 'finance'], MODULES.FINANCE)).toBe(true);
  });

  it('says no to what they did not', () => {
    expect(hasModule(['orders'], MODULES.HR)).toBe(false);
  });

  it('assumes everything when nothing has been resolved', () => {
    // This gates a menu, not access. A blank product is a worse failure than a
    // screen that says no.
    expect(hasModule(undefined, MODULES.HR)).toBe(true);
  });

  it('says no to an empty list, which is a resolved answer', () => {
    expect(hasModule([], MODULES.HR)).toBe(false);
  });
});
