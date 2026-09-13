import { PERMISSIONS, MODULES } from '@fas/shared';
import { hasMenuBeyondSettings, menuRows, navItemVisible } from './menu';

const allow = (permissions: string[], modules: string[] | null = null) => ({
  can: (permission: string) => permissions.includes(permission),
  has: (module: string) => modules === null || modules.includes(module),
});

const everything = allow(Object.values(PERMISSIONS));
const nothing = allow([]);

describe('navItemVisible', () => {
  const visible = navItemVisible(everything);

  it('needs the screen to exist in the app at all', () => {
    // A web-only row is in the tree; it is not in this menu.
    expect(visible({ key: 'x', label: 'X', icon: 'tune', web: '/x' })).toBe(false);
    expect(visible({ key: 'x', label: 'X', icon: 'tune', app: 'X' })).toBe(true);
  });

  it('needs the permission, where the row names one', () => {
    const item = { key: 'x', label: 'X', icon: 'tune', app: 'X', permission: PERMISSIONS.USER_VIEW };

    expect(navItemVisible(allow([PERMISSIONS.USER_VIEW]))(item)).toBe(true);
    expect(navItemVisible(allow([PERMISSIONS.ORDER_VIEW]))(item)).toBe(false);
  });

  /*
   * Two gates, not one. The plan decides what the business bought, the role
   * decides who inside it may touch it, and the API refuses on either.
   */
  it('needs the module too, where the row names one', () => {
    const item = { key: 'x', label: 'X', icon: 'tune', app: 'X', module: MODULES.QUOTES };

    expect(navItemVisible(allow([], [MODULES.QUOTES]))(item)).toBe(true);
    expect(navItemVisible(allow(Object.values(PERMISSIONS), []))(item)).toBe(false);
  });
});

describe('menuRows', () => {
  it('finds every row for somebody with everything', () => {
    expect(menuRows(everything).length).toBeGreaterThan(15);
  });

  it('leaves somebody with nothing the one row that needs no permission', () => {
    expect(menuRows(nothing).map((item) => item.key)).toEqual(['settings']);
  });

  it('reaches rows nested inside a module’s own settings', () => {
    const keys = menuRows(everything).map((item) => item.key);

    expect(keys).toContain('materials');
    expect(keys).toContain('lead-fields');
  });
});

/*
 * What the last slot in the tab bar asks.
 *
 * It used to ask whether the role was literally ADMIN — wrong for a shop that
 * renames or splits its roles, and an answer that stops agreeing with the menu
 * the moment a row's gating changes.
 */
describe('hasMenuBeyondSettings', () => {
  it('is true for somebody with the run of the place', () => {
    expect(hasMenuBeyondSettings(everything)).toBe(true);
  });

  it('is false when Settings is all that would be in there', () => {
    expect(hasMenuBeyondSettings(nothing)).toBe(false);
  });

  it('is true on a single permission, whatever the role is called', () => {
    expect(hasMenuBeyondSettings(allow([PERMISSIONS.ORDER_VIEW]))).toBe(true);
  });

  it('is false when the permission is there and the workspace never bought it', () => {
    expect(hasMenuBeyondSettings(allow([PERMISSIONS.ORDER_VIEW], []))).toBe(false);
  });

  // Otherwise a menu of one row opens where that row would have done.
  it('does not count Settings itself', () => {
    expect(menuRows(nothing)).toHaveLength(1);
    expect(hasMenuBeyondSettings(nothing)).toBe(false);
  });
});
