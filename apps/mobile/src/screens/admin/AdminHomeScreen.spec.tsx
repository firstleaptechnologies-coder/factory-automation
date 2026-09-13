import { fireEvent, render, screen } from '@testing-library/react-native';
import { NAV_GROUPS, PERMISSIONS } from '@fas/shared';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AdminHomeScreen } from './AdminHomeScreen';

const mockMaterials = jest.fn();
const mockSizePresets = jest.fn();
const mockLeadFields = jest.fn();
const mockWorkflows = jest.fn();
jest.mock('../../api/client', () => ({
  api: {
    materials: (...a: unknown[]) => mockMaterials(...a),
    sizePresets: (...a: unknown[]) => mockSizePresets(...a),
    leadFields: (...a: unknown[]) => mockLeadFields(...a),
    workflows: (...a: unknown[]) => mockWorkflows(...a),
  },
}));

let mockGranted: string[] = [];
let mockModules: string[] | null = null;
jest.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({
    can: (permission: string) => mockGranted.includes(permission),
    // A workspace with everything, unless a test says otherwise.
    has: (module: string) => mockModules === null || mockModules.includes(module),
  }),
}));

const navigate = jest.fn();
const goBack = jest.fn();

async function mount({
  materials = [{ id: 'm1' }, { id: 'm2' }],
  sizes = [{ id: 's1' }],
  fields = [{ id: 'f1' }, { id: 'f2' }, { id: 'f3' }],
  workflows = [{ id: 'w1', _count: { statuses: 5 } }],
}: Record<string, unknown[]> = {}) {
  mockMaterials.mockResolvedValue(materials);
  mockSizePresets.mockResolvedValue(sizes);
  mockLeadFields.mockResolvedValue(fields);
  mockWorkflows.mockResolvedValue(workflows);
  await render(<AdminHomeScreen navigation={{ navigate, goBack }} />);
  await screen.findByText('Menu');
}

beforeEach(() => {
  mockModules = null;
  jest.clearAllMocks();
  // The settings rows are gated the same way the web sidebar gates them.
  mockGranted = [PERMISSIONS.CONFIG_VIEW];
});

it('counts what is configured, so a thin list is visible without opening it', async () => {
  await mount();
  // An empty materials list is the difference between punching being possible
  // and not, so the count belongs on the way in.
  expect(screen.getByText('2')).toBeTruthy();
  expect(screen.getByText('1')).toBeTruthy();
  expect(screen.getByText('3')).toBeTruthy();
});

it('counts the stages across every workflow, not the workflows', async () => {
  await mount({ workflows: [{ id: 'w1', _count: { statuses: 5 } }, { id: 'w2', _count: { statuses: 4 } }] });
  expect(screen.getByText('9')).toBeTruthy();
});

it('survives a workflow the server sent without its counts', async () => {
  await mount({ workflows: [{ id: 'w1' }] });
  expect(screen.getByText('Status flow')).toBeTruthy();
  expect(screen.getAllByText('0').length).toBeGreaterThan(0);
});

it('asks for the deactivated rows too, because this is where they are turned back on', async () => {
  await mount();
  expect(mockMaterials).toHaveBeenCalledWith(true);
  expect(mockSizePresets).toHaveBeenCalledWith(true);
  expect(mockLeadFields).toHaveBeenCalledWith(true);
});

it.each([
  ['Materials', 'AdminMaterials'],
  ['Sizes', 'AdminSizes'],
  ['Status flow', 'AdminFlow'],
  ['Lead fields', 'AdminLeadFields'],
  ['Settings', 'Settings'],
])('opens %s', async (label, route) => {
  await mount();
  await fireEvent.press(screen.getByText(label));
  expect(navigate).toHaveBeenCalledWith(route);
});

/*
 * The rows that are tabs.
 *
 * The menu is a stack screen and Orders, Leads, Home, Search and Punch live in
 * the tab navigator beside it. `navigate` walks up to a parent, never down
 * into a sibling, so navigating to them by name reached nothing: those rows
 * did nothing at all, and said so only in a console — "The action 'NAVIGATE'
 * with payload {"name":"Leads"} was not handled by any navigator".
 */
describe('the rows that are tabs rather than stack screens', () => {
  beforeEach(() => {
    mockGranted = [
      PERMISSIONS.CONFIG_VIEW,
      PERMISSIONS.ORDER_VIEW,
      PERMISSIONS.LEAD_VIEW,
      PERMISSIONS.ORDER_PUNCH,
    ];
  });

  it.each([
    ['Orders', 'Orders'],
    ['Leads', 'Leads'],
    ['Punch order', 'PunchTab'],
  ])('opens %s through the tab navigator', async (label, route) => {
    await mount();
    await fireEvent.press(screen.getByText(label));

    expect(navigate).toHaveBeenCalledWith('Main', { screen: route });
  });
});

/*
 * Every row, not the handful somebody thought to test.
 *
 * The menu is the one screen that lists the whole app, so a row that goes
 * nowhere is the failure that matters most here — and the Orders and Leads
 * rows went nowhere for as long as the menu has existed, because the route
 * name comes out of NAV_GROUPS and no test pressed them.
 *
 * The target is checked against the navigator on disk rather than an expected
 * value written here: a list written by hand is a list that agrees with itself.
 */
describe('every row in the menu', () => {
  const registry = readFileSync(
    join(__dirname, '../../navigation/index.tsx'),
    'utf8',
  );

  const registered = new Set(
    [...registry.matchAll(/(?:Stack|Tabs)\.Screen\s+name="([A-Za-z]+)"/g)].map(
      (match) => match[1],
    ),
  );

  /*
   * Which of them are tabs matters, and nothing else here can tell.
   * `navigate('Orders')` from this screen names a route that exists and still
   * reaches nothing, because it is in a navigator below this one rather than
   * above it — so "the name is registered" is not the question. "Was it opened
   * through the navigator it lives in" is.
   */
  const tabs = new Set(
    [...registry.matchAll(/Tabs\.Screen\s+name="([A-Za-z]+)"/g)].map((match) => match[1]),
  );

  const rows: { label: string; app: string }[] = [];
  const collect = (group: (typeof NAV_GROUPS)[number]) => {
    for (const item of group.items ?? []) {
      if (item.app) rows.push({ label: item.label, app: item.app });
    }
    for (const inner of group.groups ?? []) collect(inner);
  };
  NAV_GROUPS.forEach(collect);

  beforeEach(() => {
    // Everything on, so no row is skipped for a reason unrelated to whether it
    // works: the gating has its own tests.
    mockGranted = Object.values(PERMISSIONS);
    mockModules = null;
  });

  it('has rows at all, so an empty walk does not pass silently', () => {
    expect(rows.length).toBeGreaterThan(15);
  });

  it.each(rows.map((row) => [row.label, row.app]))(
    '%s opens a screen the navigator actually has',
    async (label, app) => {
      await mount();
      await fireEvent.press(screen.getByText(label));

      expect(navigate).toHaveBeenCalled();
      const [route, params] = navigate.mock.calls[0];

      expect(registered.has(app)).toBe(true);
      expect(tabs.has(app) ? [route, (params as { screen: string })?.screen] : [route]).toEqual(
        tabs.has(app) ? ['Main', app] : [app],
      );
    },
  );
});

it('goes back', async () => {
  await mount();
  await fireEvent.press(screen.getByLabelText('Back'));
  expect(goBack).toHaveBeenCalled();
});

describe('what each person is allowed to see', () => {
  it('hides the money and payout rows from someone without those permissions', async () => {
    await mount();
    expect(screen.queryByText('Transactions')).toBeNull();
    expect(screen.queryByText('Payout ledger')).toBeNull();
  });

  it('hides the settings from somebody who may not configure', async () => {
    mockGranted = [];
    await mount();
    expect(screen.queryByText('Materials')).toBeNull();
    expect(screen.queryByText('Firm details')).toBeNull();
  });

  it('shows the transactions only to whoever may see them', async () => {
    mockGranted = [...mockGranted, PERMISSIONS.CASH_POSITION_VIEW];
    await mount();
    await fireEvent.press(screen.getByText('Transactions'));
    expect(navigate).toHaveBeenCalledWith('Transactions');
  });

  it('shows the firm details only to whoever may configure them', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Firm details'));
    expect(navigate).toHaveBeenCalledWith('FirmProfile');
  });

  it('shows the payout ledger only to whoever may see payouts', async () => {
    mockGranted = [...mockGranted, PERMISSIONS.DISBURSEMENT_VIEW];
    await mount();
    // Payouts sit beside orders rather than inside them, so the ledger is its
    // own destination.
    await fireEvent.press(screen.getByText('Payout ledger'));
    expect(navigate).toHaveBeenCalledWith('DisbursementLedger');
  });

  it('offers the clients the shop works for', async () => {
    mockGranted = [...mockGranted, PERMISSIONS.CLIENT_VIEW];
    await mount();
    await fireEvent.press(screen.getByText('Clients'));
    expect(navigate).toHaveBeenCalledWith('Clients');
  });

  it('hides them from somebody who may not see them', async () => {
    await mount();
    expect(screen.queryByText('Clients')).toBeNull();
  });

  it('leaves settings reachable by everyone', async () => {
    await mount();
    expect(screen.getByText('Display unit, account, sign out')).toBeTruthy();
  });
});

describe('the categories', () => {
  const all = () => {
    mockGranted = Object.values(PERMISSIONS) as string[];
  };

  it('groups the screens by what they are for', async () => {
    all();
    await mount();
    for (const heading of ['Order management', 'Finances', 'Vendor management', 'Workspace']) {
      expect(screen.getByText(heading)).toBeTruthy();
    }
  });

  it('keeps a module’s own settings inside that module', async () => {
    all();
    await mount();
    expect(screen.getByText('Order settings')).toBeTruthy();
  });

  it('offers the day-to-day screens, not only the settings', async () => {
    all();
    await mount();
    // The menu is every screen there is, grouped — not an admin drawer.
    for (const label of ['Punch order', 'Orders', 'Leads', 'Quotes']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('folds a category away, and says so', async () => {
    all();
    await mount();
    expect(screen.getByText('Payout ledger')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('menu-group-finances'));
    // A list that only grows becomes a list nobody reads.
    expect(screen.queryByText('Payout ledger')).toBeNull();
    expect(
      screen.getByTestId('menu-group-finances').props.accessibilityState.expanded,
    ).toBe(false);
  });

  it('opens it again', async () => {
    all();
    await mount();
    await fireEvent.press(screen.getByTestId('menu-group-finances'));
    await fireEvent.press(screen.getByTestId('menu-group-finances'));
    expect(screen.getByText('Payout ledger')).toBeTruthy();
  });

  it('opens every category to begin with, so nothing is hidden by default', async () => {
    all();
    await mount();
    expect(screen.getByText('Transactions')).toBeTruthy();
    expect(screen.getByText('Clients')).toBeTruthy();
    expect(screen.getByText('Materials')).toBeTruthy();
  });
});


describe('what a plan reaches', () => {
  it('hides a module the workspace has not bought', async () => {
    mockGranted = [PERMISSIONS.LEAD_VIEW, PERMISSIONS.ORDER_VIEW];
    mockModules = ['orders', 'clients'];
    await mount();

    // Two gates, and both have to pass.
    expect(screen.queryByText('Leads')).toBeNull();
    expect(screen.getByText('Orders')).toBeTruthy();
  });

  it('keeps what they did buy', async () => {
    mockGranted = [PERMISSIONS.LEAD_VIEW];
    mockModules = ['orders', 'clients', 'leads'];
    await mount();
    expect(screen.getByText('Leads')).toBeTruthy();
  });
});
