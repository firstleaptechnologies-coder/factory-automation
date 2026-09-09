import { ALL_MODULES } from './modules';
import { PERMISSIONS, PLATFORM_PERMISSIONS, Permission } from './permissions';
import {
  PERMISSION_TREE,
  PLATFORM_PERMISSION_TREE,
  permissionsInTree,
  platformPermissionsInTree,
  permissionsUnder,
  tickState,
  toggleBranch,
} from './permission-tree';

/** Everything a workspace's own roles can hold — the platform's are separate. */
const TENANT_PERMISSIONS = Object.values(PERMISSIONS).filter(
  (permission) => !(PLATFORM_PERMISSIONS as string[]).includes(permission),
) as Permission[];

describe('the tree accounts for every permission', () => {
  // The rail. A permission nobody can tick is a feature nobody can be given,
  // and it fails silently: the screen simply does not show it.
  it('shows every permission a workspace role can hold', () => {
    const shown = new Set(permissionsInTree());
    const missing = TENANT_PERMISSIONS.filter((permission) => !shown.has(permission));

    expect(missing).toEqual([]);
  });

  // And the other way: a permission that no longer exists, still on the tree,
  // is a checkbox that grants nothing.
  it('shows nothing that is not a permission', () => {
    const real = new Set<string>(Object.values(PERMISSIONS));
    const orphaned = permissionsInTree().filter((permission) => !real.has(permission));

    expect(orphaned).toEqual([]);
  });

  // The bug the flat list had twice over: `Buying and stock` listed
  // identically two times, and `People` listed twice meaning different things.
  it('shows each permission exactly once', () => {
    const seen = new Map<string, number>();
    for (const permission of permissionsInTree()) {
      seen.set(permission, (seen.get(permission) ?? 0) + 1);
    }
    const duplicated = [...seen.entries()].filter(([, count]) => count > 1).map(([key]) => key);

    expect(duplicated).toEqual([]);
  });

  it('leaves the platform permissions out of a workspace tree', () => {
    const shown = new Set(permissionsInTree());
    const leaked = PLATFORM_PERMISSIONS.filter((permission) => shown.has(permission));

    expect(leaked).toEqual([]);
  });
});

describe('the tree is navigable', () => {
  const keys: string[] = [];
  for (const section of PERMISSION_TREE) {
    keys.push(section.key);
    for (const feature of section.features) {
      keys.push(feature.key);
      for (const group of feature.groups) keys.push(group.key);
    }
  }

  it('has a unique key at every level', () => {
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('labels every section, feature and group', () => {
    for (const section of PERMISSION_TREE) {
      expect(section.label).toBeTruthy();
      for (const feature of section.features) {
        expect(feature.label).toBeTruthy();
        for (const group of feature.groups) {
          expect(group.label).toBeTruthy();
          expect(group.permissions.length).toBeGreaterThan(0);
        }
      }
    }
  });

  // A section hung off a module that does not exist would grey out for every
  // workspace, for ever, with nothing to explain why.
  it('names a real module, or none at all', () => {
    for (const section of PERMISSION_TREE) {
      if (section.module === null) continue;
      expect(ALL_MODULES).toContain(section.module);
    }
  });

  it('rolls permissions up from every level', () => {
    const finance = PERMISSION_TREE.find((one) => one.key === 'finance')!;

    expect(permissionsUnder(finance)).toContain(PERMISSIONS.PAYMENT_RECORD);
    expect(permissionsUnder(finance)).toContain(PERMISSIONS.INVOICE_ISSUE);
    expect(permissionsUnder(finance.features[0])).toContain(PERMISSIONS.DISBURSEMENT_VIEW);
    expect(permissionsUnder(finance.features[0].groups[0])).toContain(PERMISSIONS.PAYMENT_VIEW);
  });
});

describe('ticking a branch', () => {
  const three: Permission[] = [
    PERMISSIONS.ORDER_VIEW,
    PERMISSIONS.ORDER_PUNCH,
    PERMISSIONS.ORDER_EDIT,
  ];

  it('is none when nothing under it is held', () => {
    expect(tickState(three, [])).toBe('none');
  });

  it('is all when everything under it is held', () => {
    expect(tickState(three, three)).toBe('all');
  });

  // Showing a half-ticked branch as unticked invites somebody to tick it and
  // silently grant the rest.
  it('is some when part of it is held', () => {
    expect(tickState(three, [PERMISSIONS.ORDER_VIEW])).toBe('some');
  });

  it('is none for a branch with nothing under it', () => {
    expect(tickState([], [])).toBe('none');
  });

  it('turns a branch fully on from empty', () => {
    expect(toggleBranch(three, []).sort()).toEqual([...three].sort());
  });

  // The useful half: a partly-ticked branch fills in rather than clearing,
  // because that is what somebody tapping it means.
  it('fills in a half-ticked branch rather than clearing it', () => {
    expect(toggleBranch(three, [PERMISSIONS.ORDER_VIEW]).sort()).toEqual([...three].sort());
  });

  it('clears a branch that was fully on', () => {
    expect(toggleBranch(three, three)).toEqual([]);
  });

  it('leaves permissions outside the branch alone', () => {
    const next = toggleBranch(three, [PERMISSIONS.SALARY_PAY]);

    expect(next).toContain(PERMISSIONS.SALARY_PAY);
  });
});

describe('the platform tree', () => {
  // The same rail, for the tree above the tenants. A platform permission
  // nobody can tick is a job nobody can be given.
  it('shows every platform permission', () => {
    const shown = new Set(platformPermissionsInTree());
    const missing = PLATFORM_PERMISSIONS.filter((permission) => !shown.has(permission));

    expect(missing).toEqual([]);
  });

  it('shows each of them exactly once', () => {
    const shown = platformPermissionsInTree();

    expect(new Set(shown).size).toBe(shown.length);
  });

  // And nothing from the shop's side: a tenant permission on a platform role
  // grants nothing — a platform user is inside nobody's workspace — but it
  // would read as if it did.
  it('leaves a tenant permission out', () => {
    const platform = new Set<string>(PLATFORM_PERMISSIONS);
    const leaked = platformPermissionsInTree().filter((one) => !platform.has(one));

    expect(leaked).toEqual([]);
  });

  // No module gates any of it: a client's plan cannot decide what we may do
  // about them.
  it('hangs off no module at all', () => {
    for (const section of PLATFORM_PERMISSION_TREE) {
      expect(section.module).toBeNull();
    }
  });

  it('does not collide with the tenant tree’s keys', () => {
    const tenant = new Set(PERMISSION_TREE.map((one) => one.key));
    for (const section of PLATFORM_PERMISSION_TREE) {
      expect(tenant.has(section.key)).toBe(false);
    }
  });
});
