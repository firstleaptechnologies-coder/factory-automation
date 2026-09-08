import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { TabBar } from './TabBar';

let mockUser: Record<string, unknown> = { name: 'Nakul', code: 'ADMIN', role: 'ADMIN' };
jest.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));

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
  mockUser = { name: 'Nakul', code: 'ADMIN', role: 'ADMIN' };
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

describe('the settings slot', () => {
  it('opens everything an admin configures', async () => {
    const { navigate } = await mount();
    await fireEvent.press(screen.getByTestId('tab-settings'));
    expect(navigate).toHaveBeenCalledWith('Admin');
    expect(screen.getByText('More')).toBeTruthy();
  });

  it('opens plain settings for everybody else', async () => {
    mockUser = { name: 'Priya', code: 'PROD01', role: 'PRODUCTION' };
    const { navigate } = await mount();
    await fireEvent.press(screen.getByTestId('tab-settings'));
    expect(navigate).toHaveBeenCalledWith('Settings');
    expect(screen.getByText('Settings')).toBeTruthy();
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
