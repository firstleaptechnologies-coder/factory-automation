import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ArchivedLeadsPage from './page';

const leadsCall = jest.fn();
jest.mock('@/lib/api', () => ({ api: { leads: (...a: unknown[]) => leadsCall(...a) } }));

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

jest.mock('@/components/Shell', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const LEAD = {
  id: 'l1',
  code: 'LEAD-1',
  title: 'Old temple door enquiry',
  contactName: 'Verma',
  client: null,
  estimatedValue: '150000',
  status: { id: 'st1', name: 'New enquiry', color: '#6B7785' },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

async function mount(items: unknown[] = [LEAD], total = items.length) {
  leadsCall.mockResolvedValue({ data: items, meta: { page: 1, pages: 1, total, limit: 25 } });
  render(<ArchivedLeadsPage />);
  await screen.findByText('Archived');
  await waitFor(() => expect(leadsCall).toHaveBeenCalled());
}

beforeEach(() => jest.clearAllMocks());

it('asks only for the enquiries that went quiet', async () => {
  await mount();
  expect(leadsCall.mock.calls[0][0]).toMatchObject({ archived: true });
});

it('says how many there are', async () => {
  await mount([LEAD], 12);
  expect(screen.getByText('12 gone quiet')).toBeInTheDocument();
});

it('says how one comes back, since nothing was deleted', async () => {
  await mount();
  expect(screen.getByText(/it goes back on the\s+board/)).toBeInTheDocument();
});

it('leads with when each was last touched, not when it arrived', async () => {
  await mount();
  expect(screen.getByText(/last touched/)).toBeInTheDocument();
});

it('opens one, which is how it is brought back', async () => {
  await mount();
  fireEvent.click(screen.getByText('Old temple door enquiry'));
  expect(push).toHaveBeenCalledWith('/leads/board?lead=l1');
});

it('says so when nothing has gone quiet', async () => {
  await mount([]);
  expect(screen.getByText('Nothing has gone quiet')).toBeInTheDocument();
});
