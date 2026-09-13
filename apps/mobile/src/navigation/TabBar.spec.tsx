import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { PERMISSIONS } from '@fas/shared';
import { TabBar } from './TabBar';

let mockGranted: string[] = [];
let mockModules: string[] | null = null;
jest.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    can: (permission: string) => mockGranted.includes(permission),
    // A workspace with everything, unless a test says otherwise.
    has: (module: string) => mockModules === null || mockModules.includes(module),
  }),
}));

const feedback = ReactNativeHapticFeedback as unknown as { trigger: jest.Mock };

const ROUTES = [
  { key: 'home', name: 'Home' },
  { key: 'orders', name: 'Orders' },
  { key: 'search', name: 'Search' },
  { key: 'leads', name: 'Leads' },
  { key: 'punch', name: 'PunchTab' },
];

async function mount(index = 0, emitReturns = { defaultPrevented: false }) {
  const navigate = jest.fn();
  const emit = jest.fn(() => emitReturns);
  await render(
    <TabBar
      state={{ index, routes: ROUTES } as never}
      descriptors={
        Object.fromEntries(
          ROUTES.map((route) => [route.key, { options: { title: route.name } }]),
        ) as never
      }
      navigation={{ navigate, emit } as never}
      insets={{ top: 0, right: 0, bottom: 0, left: 0 }}
    />,
  );
  return { navigate, emit };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGranted = Object.values(PERMISSIONS);
  mockModules = null;
});

it('shows the four tabs, the centre and the way into settings', async () => {
  await mount();
  for (const label of ['Home', 'Orders', 'Leads', 'More']) {
    expect(screen.getByText(label)).toBeTruthy();
  }
  expect(screen.getByTestId('tab-search')).toBeTruthy();
});

it('does not draw punching in the bar', async () => {
  await mount();
  // Still a route — a half-filled punch survives leaving it — but reached from
  // the home card rather than the bar.
  expect(screen.queryByText('PunchTab')).toBeNull();
  expect(screen.queryByText('Punch')).toBeNull();
});

describe('the centre button', () => {
  it('is search, reachable from wherever you are', async () => {
    const { navigate } = await mount();
    await fireEvent.press(screen.getByTestId('tab-search'));
    expect(navigate).toHaveBeenCalledWith('Search');
  });

  it('shows when search is the tab being looked at', async () => {
    await mount(2);
    expect(screen.getByTestId('tab-search').props.accessibilityState.selected).toBe(true);
  });

  it('taps out heavier feedback than a plain tab', async () => {
    await mount();
    await fireEvent.press(screen.getByTestId('tab-search'));
    expect(feedback.trigger).toHaveBeenCalledWith('impactMedium', expect.anything());
  });
});

/*
 * The last slot opens the menu, or Settings when the menu would hold nothing
 * else.
 *
 * It used to ask whether the role was literally called ADMIN, which is the
 * wrong question twice: a shop that renames its roles — or gives a second
 * person every permission without calling them ADMIN — got somebody who could
 * reach nothing, and the answer stopped agreeing with what the menu draws the
 * moment a row's gating changed.
 */
describe('the settings slot', () => {
  it('opens the menu for somebody with screens in it', async () => {
    const { navigate } = await mount();
    await fireEvent.press(screen.getByTestId('tab-settings'));
    expect(navigate).toHaveBeenCalledWith('Admin');
    expect(screen.getByText('More')).toBeTruthy();
  });

  it('opens plain settings when the menu would hold only settings', async () => {
    mockGranted = [];
    const { navigate } = await mount();
    await fireEvent.press(screen.getByTestId('tab-settings'));
    expect(navigate).toHaveBeenCalledWith('Settings');
    expect(screen.getByText('Settings')).toBeTruthy();
  });

  it('opens the menu for a role nobody called ADMIN', async () => {
    // One permission is enough: there is now a screen in there for them.
    mockGranted = [PERMISSIONS.ORDER_VIEW];
    const { navigate } = await mount();

    await fireEvent.press(screen.getByTestId('tab-settings'));

    expect(navigate).toHaveBeenCalledWith('Admin');
  });

  it('counts the module as well as the permission', async () => {
    // Allowed to see orders, in a workspace that has not bought them: the API
    // refuses it, so the row is not there and the menu holds only Settings.
    mockGranted = [PERMISSIONS.ORDER_VIEW];
    mockModules = [];
    const { navigate } = await mount();

    await fireEvent.press(screen.getByTestId('tab-settings'));

    expect(navigate).toHaveBeenCalledWith('Settings');
  });

  it('never reads as the tab you are standing in, since it is not a tab', async () => {
    const { palette } = require('../theme');
    await mount(0);
    expect(screen.getByText('More').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: palette.textMuted })]),
    );
  });
});

it('navigates to the tab that was pressed', async () => {
  const { navigate } = await mount();
  await fireEvent.press(screen.getByText('Orders'));
  expect(navigate).toHaveBeenCalledWith('Orders');
});

it('announces the press so a screen can intercept it', async () => {
  const { emit } = await mount();
  await fireEvent.press(screen.getByText('Orders'));
  expect(emit).toHaveBeenCalledWith({
    type: 'tabPress',
    target: 'orders',
    canPreventDefault: true,
  });
});

it('does not navigate when a screen prevented the move', async () => {
  const { navigate } = await mount(0, { defaultPrevented: true });
  await fireEvent.press(screen.getByText('Orders'));
  expect(navigate).not.toHaveBeenCalled();
});

it('does not re-navigate to the tab already showing', async () => {
  const { navigate } = await mount(0);
  await fireEvent.press(screen.getByText('Home'));
  // Otherwise a second tap resets the stack the user is standing in.
  expect(navigate).not.toHaveBeenCalled();
});

it('taps out feedback on a tab press', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Orders'));
  expect(feedback.trigger).toHaveBeenCalledWith('impactLight', expect.anything());
});

it('paints the tab the person is standing in', async () => {
  await mount(1);
  const { palette } = require('../theme');
  expect(screen.getByText('Orders').props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ color: palette.accent })]),
  );
});

it('leaves the other tabs muted', async () => {
  await mount(1);
  const { palette } = require('../theme');
  expect(screen.getByText('Home').props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ color: palette.textMuted })]),
  );
});

it('takes the title a screen gave itself over the route name', async () => {
  const navigate = jest.fn();
  await render(
    <TabBar
      state={{ index: 0, routes: ROUTES } as never}
      descriptors={{ ...Object.fromEntries(ROUTES.map((r) => [r.key, { options: {} }])), home: { options: { title: 'Today' } } } as never}
      navigation={{ navigate, emit: () => ({ defaultPrevented: false }) } as never}
      insets={{ top: 0, right: 0, bottom: 0, left: 0 }}
    />,
  );
  expect(screen.getByText('Today')).toBeTruthy();
});

/*
 * The touch target, not the drawing.
 *
 * The bar rendered correctly and was completely dead to taps: a row with
 * `alignItems: 'center'` sizes each child to its content, so the tab's
 * touchable box was about 39pt tall — under Apple's 44pt minimum and shorter
 * than the icon-plus-label it appears to be. A tap on the label, or a little
 * under the icon, landed on the bar behind it and did nothing.
 *
 * Only the raised centre button kept working, because it is positioned
 * absolutely and sizes itself.
 */
describe('the tab touch target', () => {
  it('fills the height of the bar rather than hugging its icon', async () => {
    await mount();

    const orders = screen.getByLabelText('Orders');
    expect(StyleSheet.flatten(orders.props.style)).toMatchObject({
      flex: 1,
      alignSelf: 'stretch',
    });
  });

  // Every tab, not just the one that happened to be checked.
  it('does the same for all four', async () => {
    await mount();

    for (const label of ['Home', 'Orders', 'Leads', 'More']) {
      const tab = screen.getByLabelText(label);
      expect(StyleSheet.flatten(tab.props.style)).toMatchObject({ alignSelf: 'stretch' });
    }
  });
});
