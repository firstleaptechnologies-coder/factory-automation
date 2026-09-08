import { fireEvent, render, screen } from '@testing-library/react-native';
import { PERMISSIONS } from '@decor/shared';
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
jest.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({ can: (permission: string) => mockGranted.includes(permission) }),
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
