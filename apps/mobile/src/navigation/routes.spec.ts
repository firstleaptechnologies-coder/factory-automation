import { TAB_ROUTES, TABS_ROUTE, goTo, isTabRoute } from './routes';

const nav = () => ({ navigate: jest.fn() });

it('knows which routes are tabs', () => {
  expect(isTabRoute('Leads')).toBe(true);
  expect(isTabRoute('Clients')).toBe(false);
  // Not a substring match: 'Order' is not 'Orders', and neither is 'OrderDetail'.
  expect(isTabRoute('OrderDetail')).toBe(false);
});

describe.each(TAB_ROUTES)('going to the %s tab', (route) => {
  it('goes through the navigator it actually lives in', () => {
    const navigation = nav();

    goTo(navigation, route);

    // Not `navigate(route)`: from a stack screen that reaches no navigator at
    // all, and react-navigation refuses it with a console line and nothing else.
    expect(navigation.navigate).toHaveBeenCalledWith(TABS_ROUTE, { screen: route });
  });
});

it('carries params into the tab', () => {
  const navigation = nav();

  goTo(navigation, 'Orders', { statusId: 's1' });

  expect(navigation.navigate).toHaveBeenCalledWith(TABS_ROUTE, {
    screen: 'Orders',
    params: { statusId: 's1' },
  });
});

it('leaves a stack route exactly as it was', () => {
  const navigation = nav();

  goTo(navigation, 'OrderDetail', { orderId: 'o1' });

  expect(navigation.navigate).toHaveBeenCalledWith('OrderDetail', { orderId: 'o1' });
});

it('passes an unknown route straight through rather than guessing', () => {
  const navigation = nav();

  // A route the navigator does not have should fail where it fails today —
  // loudly, in react-navigation — not be quietly rewritten into a tab.
  goTo(navigation, 'Nonsense');

  expect(navigation.navigate).toHaveBeenCalledWith('Nonsense');
});
