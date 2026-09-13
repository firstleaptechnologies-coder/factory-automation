/**
 * The five screens that live in the tab navigator rather than the stack.
 *
 * They are the reason `navigation.navigate('Leads')` is not always enough.
 * `navigate` walks *up* to a parent navigator, never down into a sibling, so
 * the call works from inside the tabs and is refused everywhere else — the
 * menu is a stack screen, and its Orders and Leads rows did nothing but print
 * "The action 'NAVIGATE' ... was not handled by any navigator" to a console
 * nobody on a shop floor is reading.
 *
 * `navigation/tab-reach.spec.ts` fails when a stack screen goes back to
 * navigating to one of these by name.
 */
export const TAB_ROUTES = ['Home', 'Orders', 'Search', 'Leads', 'PunchTab'] as const;

export type TabRoute = (typeof TAB_ROUTES)[number];

/** The stack route the tab navigator is registered under. */
export const TABS_ROUTE = 'Main';

export function isTabRoute(route: string): route is TabRoute {
  return (TAB_ROUTES as readonly string[]).includes(route);
}

type Navigator = { navigate: (route: string, params?: object) => void };

/**
 * Go to a screen from anywhere in the app.
 *
 * Use this wherever the destination is not a literal a reader can check
 * against the navigator — a menu walking `NAV_GROUPS`, a deep link, a
 * notification — because those are exactly the callers that cannot know
 * whether what they hold is a tab or a stack screen.
 */
export function goTo(navigation: Navigator, route: string, params?: object): void {
  if (isTabRoute(route)) {
    // `params` left off rather than passed as undefined, so a tab that is
    // already showing is not handed an empty params object and remounted.
    navigation.navigate(TABS_ROUTE, params ? { screen: route, params } : { screen: route });
    return;
  }
  if (params) {
    navigation.navigate(route, params);
    return;
  }
  navigation.navigate(route);
}
