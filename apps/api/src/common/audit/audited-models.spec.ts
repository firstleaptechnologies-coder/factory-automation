import { TENANT_SCOPED_MODELS } from '../tenancy/tenant-models';
import { AUDITED_MODELS, NOT_AUDITED } from './audited-models';

/**
 * A model added next year should be a failing test, not a silent gap in the
 * trail. "Every change is recorded" is only true if nobody has to remember.
 */
describe('what has a history', () => {
  it('accounts for every model holding a shop’s data', () => {
    const unaccounted = [...TENANT_SCOPED_MODELS].filter(
      (model) => !AUDITED_MODELS.has(model) && !(model in NOT_AUDITED),
    );
    expect(unaccounted).toEqual([]);
  });

  it('gives a reason for everything left out', () => {
    for (const [model, reason] of Object.entries(NOT_AUDITED)) {
      expect(reason.length).toBeGreaterThan(10);
      // An exemption for a model that no longer exists hides a real gap.
      expect(TENANT_SCOPED_MODELS.has(model)).toBe(true);
    }
  });

  it('records the things a shop argues about', () => {
    for (const model of ['Order', 'OrderItem', 'Payment', 'Disbursement', 'Lead', 'Estimate', 'Client', 'User', 'Role']) {
      expect(AUDITED_MODELS.has(model)).toBe(true);
    }
  });

  it('never records the trail itself, or file contents', () => {
    expect(AUDITED_MODELS.has('AuditLog')).toBe(false);
    // A diff of a StoredFile would copy every uploaded photo into the log.
    expect(AUDITED_MODELS.has('StoredFile')).toBe(false);
  });
});
