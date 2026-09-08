/**
 * Where a signed-in person belongs.
 *
 * Separated from the act of navigating so the decision can be reasoned about
 * on its own: a platform administrator belongs to no workspace, so a shop's
 * screens would have no tenant to read.
 */
export function landingFor(user: { isPlatform?: boolean | null } | null | undefined): string | null {
  if (!user) return null;
  return user.isPlatform ? '/platform/tenants' : '/';
}
