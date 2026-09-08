import {
  ALL_PERMISSIONS,
  DEFAULT_ROLES,
  PERMISSIONS,
  PERMISSION_GROUPS,
  TENANT_PERMISSIONS,
} from './permissions';

const byCode = (code: string) => DEFAULT_ROLES.find((role) => role.code === code)!;

describe('default roles', () => {
  it('gives the owner everything a shop can do', () => {
    expect(byCode('OWNER').permissions).toEqual(TENANT_PERMISSIONS);
  });

  it('keeps a manager out of roles and payment deletion', () => {
    const manager = byCode('MANAGER').permissions;
    expect(manager).not.toContain(PERMISSIONS.ROLE_MANAGE);
    expect(manager).not.toContain(PERMISSIONS.PAYMENT_DELETE);
    expect(manager).toContain(PERMISSIONS.DISBURSEMENT_MANAGE);
  });

  it('keeps sales out of the payout ledger and the GST treatment', () => {
    // Money leaving the shop and what it declares on a supply are the
    // accountant's business, not the sales desk's.
    const sales = byCode('SALES').permissions;
    expect(sales).not.toContain(PERMISSIONS.DISBURSEMENT_VIEW);
    expect(sales).not.toContain(PERMISSIONS.DISBURSEMENT_MANAGE);
    expect(sales).not.toContain(PERMISSIONS.ORDER_TERMS);
    // But they do quote and take payments.
    expect(sales).toContain(PERMISSIONS.ESTIMATE_MANAGE);
    expect(sales).toContain(PERMISSIONS.PAYMENT_RECORD);
  });

  it('shows production no money at all', () => {
    const production = byCode('PRODUCTION').permissions;
    for (const permission of production) {
      expect(permission).not.toMatch(/^(payment|disbursement|pricing)\./);
    }
    expect(production).toContain(PERMISSIONS.ORDER_MOVE_STATUS);
  });

  it('grants no role a platform permission', () => {
    // Running the product is not something a shop's own staff can do.
    for (const role of DEFAULT_ROLES) {
      for (const permission of role.permissions) {
        expect(permission.startsWith('platform.')).toBe(false);
      }
    }
  });
});

describe('the permission catalogue', () => {
  it('has no duplicate keys', () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
  });

  it('offers every tenant permission somewhere in the role editor', () => {
    // A permission the API enforces but the editor never shows is one nobody
    // can grant, which reads to the user as a broken screen.
    const grouped = new Set(PERMISSION_GROUPS.flatMap((group) => group.permissions));
    for (const permission of TENANT_PERMISSIONS) {
      expect(grouped.has(permission)).toBe(true);
    }
  });
});
