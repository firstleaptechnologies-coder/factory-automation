import { NAV_GROUPS, type ModuleKey, type NavGroup, type NavItem } from '@fas/shared';

/** The two gates, as the screens get them from `useAuth`. */
export interface Allowed {
  can: (permission: string) => boolean;
  has: (module: ModuleKey) => boolean;
}

/**
 * Whether a menu row is worth drawing for this person.
 *
 * Two gates and both have to pass: the plan decides what the business bought,
 * the role decides who inside it may touch it. Hiding a row is a courtesy —
 * the API refuses the route either way — but a menu full of screens that say
 * no is not a product.
 *
 * Shared so the menu and the bar that opens it cannot disagree about what is
 * in there.
 */
export const navItemVisible =
  (allow: Allowed) =>
  (item: NavItem): boolean =>
    Boolean(item.app) &&
    (!item.permission || allow.can(item.permission)) &&
    (!item.module || allow.has(item.module));

/** Every row this person would actually find in the menu. */
export function menuRows(allow: Allowed): NavItem[] {
  const visible = navItemVisible(allow);
  const out: NavItem[] = [];
  const walk = (group: NavGroup) => {
    out.push(...group.items.filter(visible));
    group.groups?.forEach(walk);
  };
  NAV_GROUPS.forEach(walk);
  return out;
}

/**
 * Whether the menu holds anything besides Settings.
 *
 * The last slot in the bar used to ask whether somebody's role was literally
 * ADMIN, which is the wrong question twice: a shop that renames or splits its
 * roles gets a worker with every permission and no menu, and the answer stops
 * agreeing with what the menu would actually draw the moment a row's gating
 * changes. So ask the menu.
 *
 * Settings is excluded because it is where this slot goes anyway when there is
 * nothing else — opening a menu to find one row in it is worse than opening
 * that row.
 */
export function hasMenuBeyondSettings(allow: Allowed): boolean {
  return menuRows(allow).some((item) => item.key !== 'settings');
}
