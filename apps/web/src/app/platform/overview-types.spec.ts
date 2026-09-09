import { statusColour, unpricedWarning } from './overview-types';

const totals = (over: Partial<Parameters<typeof unpricedWarning>[0]> = {}) => ({
  workspaces: 3,
  byStatus: { ACTIVE: 2, TRIAL: 1, SUSPENDED: 0 },
  monthlyRecurring: 0,
  paying: 2,
  unpricedModules: [] as string[],
  unknownPlans: 0,
  ...over,
});

describe('what is worth interrupting somebody about', () => {
  it('says nothing when everything is priced and every plan resolves', () => {
    expect(unpricedWarning(totals())).toBeNull();
  });

  // A module switched on for a client and priced for nobody is a client using
  // it for free, and nothing else in the product will ever mention it.
  it('names the modules a client has that nobody has priced', () => {
    const warning = unpricedWarning(totals({ unpricedModules: ['hr', 'purchasing'] }));

    expect(warning?.body).toContain('hr, purchasing');
    expect(warning?.body).toContain('priced for nobody');
  });

  it('reads correctly for a single unpriced module', () => {
    expect(unpricedWarning(totals({ unpricedModules: ['hr'] }))?.body).toContain('is switched on');
  });

  // The seed shipped `standard` for a year, which resolves to a plan for
  // entitlements and to no tier at all for money.
  it('flags a workspace on a plan key that matches no tier', () => {
    const warning = unpricedWarning(totals({ unknownPlans: 1 }));

    expect(warning?.body).toContain('1 workspace is on a plan key');
    expect(warning?.body).toContain('nothing can be charged');
  });

  it('says both when both are true', () => {
    const warning = unpricedWarning(totals({ unpricedModules: ['hr'], unknownPlans: 2 }));

    expect(warning?.body).toContain('hr');
    expect(warning?.body).toContain('2 workspaces are');
  });

  it('titles it as money rather than as a warning', () => {
    expect(unpricedWarning(totals({ unknownPlans: 1 }))?.title).toBe('Money nobody is collecting');
  });
});

describe('status colour', () => {
  it.each([
    ['ACTIVE', 'var(--success)'],
    ['SUSPENDED', 'var(--danger)'],
    ['TRIAL', 'var(--info)'],
    ['SOMETHING_NEW', 'var(--muted)'],
  ])('%s reads as %s', (status, expected) => {
    expect(statusColour(status)).toBe(expected);
  });
});
