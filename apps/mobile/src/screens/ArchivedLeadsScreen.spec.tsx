import { fireEvent, render, screen } from '@testing-library/react-native';
import { ArchivedLeadsScreen } from './ArchivedLeadsScreen';

const mockLeads = jest.fn();
jest.mock('../api/client', () => ({ api: { leads: (...a: unknown[]) => mockLeads(...a) } }));

const LEAD = {
  id: 'l1',
  code: 'LEAD-1',
  title: 'Kitchen jali',
  contactName: 'Verma',
  contactPhone: '9820012345',
  client: null,
  estimatedValue: '250000',
  status: { id: 'st1', name: 'New enquiry', color: '#6B7785' },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

const navigate = jest.fn();
const goBack = jest.fn();

async function mount(items: unknown[] = [LEAD], total = items.length) {
  mockLeads.mockResolvedValue({ data: items, meta: { page: 1, pages: 1, total, limit: 25 } });
  await render(<ArchivedLeadsScreen navigation={{ navigate, goBack }} />);
  await screen.findByText('Archived');
}

beforeEach(() => jest.clearAllMocks());

it('asks only for the enquiries that went quiet', async () => {
  await mount();
  expect(mockLeads.mock.calls[0][0]).toMatchObject({ archived: true });
});

it('says how many there are', async () => {
  await mount([LEAD], 12);
  expect(screen.getByText('12 gone quiet')).toBeTruthy();
});

it('says how one comes back, since nothing was deleted', async () => {
  await mount();
  // Touching a quiet lead is what revives it — there is no restore button
  // because there is nothing to restore.
  expect(screen.getByText(/it goes back on the\s+board/)).toBeTruthy();
});

it('leads with when each was last touched, not when it arrived', async () => {
  await mount();
  expect(screen.getByText(/last touched/)).toBeTruthy();
});

it('shows who the enquiry was from and what it was worth', async () => {
  await mount();
  expect(screen.getByText('Verma · 9820012345')).toBeTruthy();
  expect(screen.getByText('₹2.50 L')).toBeTruthy();
});

it('opens one, which is how it is brought back', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Kitchen jali'));
  expect(navigate).toHaveBeenCalledWith('LeadDetail', { leadId: 'l1' });
});

it('says so when nothing has gone quiet', async () => {
  await mount([]);
  expect(screen.getByText('Nothing has gone quiet')).toBeTruthy();
  expect(screen.getByText('Every enquiry has been touched inside the window.')).toBeTruthy();
});

it('goes back', async () => {
  await mount();
  await fireEvent.press(screen.getByLabelText('Back'));
  expect(goBack).toHaveBeenCalled();
});
