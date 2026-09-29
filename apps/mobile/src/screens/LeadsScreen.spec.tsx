import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { PERMISSIONS } from '@fas/shared';
import { LeadsScreen } from './LeadsScreen';

const mockLeads = jest.fn();
const mockDefaultWorkflow = jest.fn();
const mockLeadSources = jest.fn();
jest.mock('../api/client', () => ({
  api: {
    leads: (...a: unknown[]) => mockLeads(...a),
    defaultWorkflow: (...a: unknown[]) => mockDefaultWorkflow(...a),
    leadSources: (...a: unknown[]) => mockLeadSources(...a),
  },
}));

const LEAD = {
  id: 'l1',
  code: 'LEAD-1',
  title: 'Kitchen jali',
  contactName: 'Verma',
  contactPhone: '9820012345',
  client: null,
  location: 'Andheri',
  estimatedValue: '250000',
  source: { id: 'src1', name: 'Instagram', color: '#E1306C' },
  status: { id: 'st1', name: 'New enquiry', color: '#6B7785' },
  convertedOrder: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

let mockGranted: string[] = [];
jest.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ can: (p: string) => mockGranted.includes(p) }),
}));

const navigate = jest.fn();

async function mount(items: unknown[] = [LEAD], total = items.length, params: unknown = {}) {
  mockLeads.mockResolvedValue({
    data: items,
    meta: { page: 1, pages: 1, total, limit: 25 },
  });
  await render(<LeadsScreen route={{ params }} navigation={{ navigate }} />);
  await screen.findByText('Leads');
}

const lastQuery = () => mockLeads.mock.calls.at(-1)![0];

beforeEach(() => {
  jest.clearAllMocks();
  mockGranted = [PERMISSIONS.LEAD_CREATE];
  mockDefaultWorkflow.mockResolvedValue({
    id: 'w1',
    statuses: [{ id: 'st1', name: 'New enquiry', color: '#6B7785' }],
  });
  mockLeadSources.mockResolvedValue([{ id: 'src1', name: 'Instagram', color: '#E1306C' }]);
});

it('reads the enquiry pipeline, not the order flow', async () => {
  await mount();
  expect(mockDefaultWorkflow).toHaveBeenCalledWith('LEAD');
});

it('says how many enquiries there are', async () => {
  await mount([LEAD], 42);
  expect(screen.getByText('42 enquiries')).toBeTruthy();
});

it('counts one enquiry in the singular', async () => {
  await mount([LEAD], 1);
  expect(screen.getByText('1 enquiry')).toBeTruthy();
});

it('shows each enquiry with who it is from and where it stands', async () => {
  await mount();
  expect(screen.getByText('Kitchen jali')).toBeTruthy();
  expect(screen.getByText('Verma · 9820012345')).toBeTruthy();
  expect(screen.getByText('Andheri')).toBeTruthy();
  // Twice now: once as the stage chip on the rail, once as the enquiry's own
  // pill. Both are the stage — one narrows the list, the other reports it.
  expect(screen.getAllByText('New enquiry')).toHaveLength(2);
});

it('falls back to the client’s name when no contact was taken', async () => {
  await mount([{ ...LEAD, contactName: null, contactPhone: null, client: { name: 'Verma Interiors' } }]);
  expect(screen.getByText('Verma Interiors')).toBeTruthy();
});

it('shows what an enquiry might be worth', async () => {
  await mount();
  expect(screen.getByText('₹2.50 L')).toBeTruthy();
});

it('shows the order a converted enquiry became, instead of its value', async () => {
  await mount([{ ...LEAD, convertedOrder: { id: 'o1', code: 'ORD-9' } }]);
  expect(screen.getByText('→ ORD-9')).toBeTruthy();
  expect(screen.queryByText('₹2.50 L')).toBeNull();
});

it('opens one', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Kitchen jali'));
  expect(navigate).toHaveBeenCalledWith('LeadDetail', { leadId: 'l1' });
});

it('says so when nothing matches', async () => {
  await mount([]);
  expect(screen.getByText('No enquiries match')).toBeTruthy();
});

describe('the ways out of the list', () => {
  it('takes a new enquiry from the plus, without a menu in between', async () => {
    await mount();
    await fireEvent.press(screen.getByTestId('new-lead-button'));
    expect(navigate).toHaveBeenCalledWith('LeadCreate');
  });

  it('offers that only to somebody who may take one', async () => {
    mockGranted = [];
    await mount();
    expect(screen.queryByTestId('new-lead-button')).toBeNull();
    // Looking is not taking: the menu, and what is in it, stays.
    expect(screen.getByTestId('leads-menu-button')).toBeTruthy();
  });

  it('keeps the board behind the menu, not on the header', async () => {
    await mount();
    expect(screen.queryByText('Board view')).toBeNull();
    await fireEvent.press(screen.getByTestId('leads-menu-button'));
    await fireEvent.press(screen.getByText('Board view'));
    expect(navigate).toHaveBeenCalledWith('LeadBoard');
  });

  it('opens the archive of enquiries that went quiet, from the same menu', async () => {
    await mount();
    await fireEvent.press(screen.getByTestId('leads-menu-button'));
    await fireEvent.press(screen.getByText('Archived'));
    expect(navigate).toHaveBeenCalledWith('ArchivedLeads');
  });

  it('holds nothing else in the menu — the two ways of looking, and no more', async () => {
    await mount();
    await fireEvent.press(screen.getByTestId('leads-menu-button'));
    expect(screen.queryByText('New lead')).toBeNull();
  });
});

describe('searching and filtering', () => {
  it('searches on what was typed', async () => {
    await mount();
    await fireEvent.changeText(
      screen.getByPlaceholderText('Name, phone or what it is for'),
      'verma',
    );
    await waitFor(() => expect(lastQuery().search).toBe('verma'));
  });

  it('opens already filtered when a stage was handed over', async () => {
    await mount([LEAD], 1, { statusId: 'st1' });
    expect(lastQuery().statusId).toBe('st1');
  });

  // The whole point of chips over a sheet: what is on is on screen, so a
  // quietly filtered list cannot read as a missing enquiry.
  it('shows every stage and every source as a chip, on the list itself', async () => {
    await mount();
    expect(screen.getByText('All stages')).toBeTruthy();
    expect(screen.getByText('All sources')).toBeTruthy();
    expect(screen.getByTestId('stage-st1')).toBeTruthy();
    expect(screen.getByTestId('source-src1')).toBeTruthy();
  });

  it('scrolls those rails sideways rather than wrapping them down the screen', async () => {
    await mount();
    expect(screen.getByTestId('stage-filters').props.horizontal).toBe(true);
    expect(screen.getByTestId('source-filters').props.horizontal).toBe(true);
  });

  it('filters by stage and source together, a tap each', async () => {
    await mount();
    await fireEvent.press(screen.getByTestId('stage-st1'));
    await waitFor(() => expect(lastQuery().statusId).toBe('st1'));
    await fireEvent.press(screen.getByTestId('source-src1'));
    await waitFor(() => expect(lastQuery().sourceId).toBe('src1'));
    expect(lastQuery().statusId).toBe('st1');
  });

  it('clears a chip by tapping it again', async () => {
    await mount();
    await fireEvent.press(screen.getByTestId('stage-st1'));
    await waitFor(() => expect(lastQuery().statusId).toBe('st1'));
    await fireEvent.press(screen.getByTestId('stage-st1'));
    await waitFor(() => expect(lastQuery().statusId).toBeUndefined());
  });

  it('clears one from its "all" chip, which is the rail’s own name', async () => {
    await mount([LEAD], 1, { statusId: 'st1' });
    await waitFor(() => expect(lastQuery().statusId).toBe('st1'));
    await fireEvent.press(screen.getByText('All stages'));
    await waitFor(() => expect(lastQuery().statusId).toBeUndefined());
  });
});
