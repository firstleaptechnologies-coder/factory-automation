import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The seed must not put a password from this repository into a live workspace.
 *
 * This repository is public. Every default in seed.ts — admin123, platform123,
 * sales123 — is readable by anyone, so on a production database they are not
 * passwords at all, they are the published credentials of whoever deployed it.
 *
 * seedPassword() refuses to fall back when APP_ENV is production. These read
 * the file rather than running it, because running it needs a database, and
 * the thing worth protecting is that no future edit quietly reintroduces a
 * literal.
 */
const source = readFileSync(join(__dirname, '..', 'prisma', 'seed.ts'), 'utf8');

/** The same file with comments removed — prose may name a password, code may not. */
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

/** Every bcrypt.hash(...) call and what it was handed. */
const hashed = [...source.matchAll(/bcrypt\.hash\(\s*([^,]+),/g)].map((m) => m[1].trim());

/** Every `password:` the provisioning and staff calls are given. */
const passwords = [...source.matchAll(/\bpassword:\s*([^,\n]+)/g)].map((m) => m[1].trim());

describe('the seed', () => {
  it('hashes something, so these tests have something to check', () => {
    expect(hashed.length).toBeGreaterThan(0);
    expect(passwords.length).toBeGreaterThan(0);
  });

  it.each(hashed)('never hashes a literal password: %s', (argument) => {
    // A quoted string here is a credential published on GitHub.
    expect(argument).not.toMatch(/^['"`]/);
  });

  it.each(passwords)('never passes a literal password: %s', (value) => {
    expect(value).not.toMatch(/^['"`]/);
  });

  it('routes every one of them through seedPassword, directly or by way of a variable', () => {
    // `bcrypt.hash(person.password)` is fine: person.password was itself built
    // by seedPassword a few lines up. What must never appear is a quotation
    // mark, which the tests above already insist on. This checks the other
    // half — that seedPassword is where seeded passwords actually come from.
    for (const argument of [...hashed, ...passwords]) {
      const viaHelper = argument.includes('seedPassword(');
      const viaVariable = /^[A-Za-z_$][\w$.]*$/.test(argument);
      expect(viaHelper || viaVariable).toBe(true);
    }
  });

  it('calls seedPassword once for every account it creates', () => {
    // Five: the two platform users, the tenant administrator, and two staff.
    const calls = [...source.matchAll(/seedPassword\(/g)].length;
    // One of them is the declaration.
    expect(calls - 1).toBeGreaterThanOrEqual(5);
  });

  it('refuses to fall back to a default when APP_ENV is production', () => {
    expect(source).toMatch(/APP_ENV === 'production'/);
    expect(source).toMatch(/throw new Error/);
  });

  /*
   * A password printed at the end of a seed is a password in a deploy log, a
   * terminal scrollback and whatever collects them. Four of the five log lines
   * had been cleaned up and the fifth still ended in "/ firstleap123", which is
   * exactly how this kind of thing survives: it looks done.
   */
  it('never prints a password when it finishes', () => {
    const logs = [...source.matchAll(/console\.log\(([^;]*)\);/g)].map((m) => m[1]);
    for (const line of logs) {
      expect(line).not.toMatch(/\/\s*\w*\d\w*`/);
      for (const known of ['platform123', 'admin123', 'sales123', 'prod123', 'flt12345', 'firstleap123']) {
        expect(line).not.toContain(known);
      }
    }
  });

  it('has no development password left anywhere but seedPassword defaults', () => {
    for (const known of ['platform123', 'admin123', 'sales123', 'prod123', 'flt12345', 'firstleap123']) {
      const uses = [...code.matchAll(new RegExp(known, 'g'))].length;
      // Once, as the second argument to seedPassword. Never twice.
      expect(uses).toBe(1);
      expect(code).toMatch(new RegExp(`seedPassword\\([^)]*'${known}'`));
    }
  });

  it('will not accept a short password either', () => {
    // A supplied password is only better than the published one if it is not
    // guessable in an afternoon.
    expect(source).toMatch(/length >= 12/);
  });
});
