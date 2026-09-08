import { ProcessRole, roleOf, runsScheduledWork } from './role';

describe('reading the process role', () => {
  it.each([
    ['api', 'api'],
    ['worker', 'worker'],
    ['both', 'both'],
  ])('reads %s', (given, expected) => {
    expect(roleOf(given)).toBe(expected);
  });

  it('forgives case and surrounding space', () => {
    expect(roleOf('  Worker ')).toBe('worker');
  });

  // Nothing sets ROLE today. Defaulting to `api` would stop every nightly job
  // in development, in CI and in any single-container deployment, and the only
  // symptom would be that nothing ever happened.
  it.each([undefined, null, '', '   '])('defaults to both when unset (%p)', (given) => {
    expect(roleOf(given)).toBe('both');
  });

  // A typo must not fall through to a default: the failure it causes is
  // silence, which is the hardest kind to notice.
  it.each(['workers', 'web', 'API_SERVER'])('refuses %s rather than guessing', (given) => {
    expect(() => roleOf(given)).toThrow(/ROLE must be one of/);
  });

  it('names what it got, so the mistake is obvious', () => {
    expect(() => roleOf('workers')).toThrow(/got "workers"/);
  });
});

describe('who runs the clock', () => {
  it.each<[ProcessRole, boolean]>([
    ['worker', true],
    ['both', true],
    ['api', false],
  ])('%s runs scheduled work: %p', (role, expected) => {
    expect(runsScheduledWork(role)).toBe(expected);
  });
});
