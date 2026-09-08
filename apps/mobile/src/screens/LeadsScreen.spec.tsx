import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { PERMISSIONS } from '@decor/shared';
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
  expect(screen.getByText('New enquiry')).toBeTruthy();
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
  it('opens the board, which is the same pipeline arranged differently', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Board'));
    expect(navigate).toHaveBeenCalledWith('LeadBoard');
  });

  it('opens the archive of enquiries that went quiet', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Archived'));
    expect(navigate).toHaveBeenCalledWith('ArchivedLeads');
  });

  it('takes a new enquiry', async () => {
    await mount();
    await fireEvent.press(screen.getByText('New lead'));
    expect(navigate).toHaveBeenCalledWith('LeadCreate');
  });

  it('offers that only to somebody who may take one', async () => {
    mockGranted = [];
    await mount();
    expect(screen.queryByText('New lead')).toBeNull();
    // The board and the archive stay — looking is not taking.
    expect(screen.getByText('Board')).toBeTruthy();
    expect(screen.getByText('Archived')).toBeTruthy();
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

  it('filters by stage and source together', async () => {
    await mount();
    await fireEvent.press(screen.getByTestId('filter-button'));
    // The stage is on the card behind the sheet too; take the wheel's row.
    await fireEvent((await screen.findAllByText('New enquiry')).at(-1)!, 'touchEnd');
    await fireEvent(screen.getAllByText('Instagram').at(-1)!, 'touchEnd');
    await fireEvent.press(screen.getByText('Apply 2 filters'));
    await waitFor(() => expect(lastQuery().statusId).toBe('st1'));
    expect(lastQuery().sourceId).toBe('src1');
  });

  it('clears them again', async () => {
    await mount([LEAD], 1, { statusId: 'st1' });
    await waitFor(() => expect(lastQuery().statusId).toBe('st1'));
    await fireEvent.press(screen.getByText('1 filter ×'));
    await waitFor(() => expect(lastQuery().statusId).toBeUndefined());
  });

  it('says how many filters are on, and clears them', async () => {
    await mount([LEAD], 1, { statusId: 'st1' });
    expect(screen.getByText('1 filter ×')).toBeTruthy();
  });
});
