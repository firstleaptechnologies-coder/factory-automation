import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PERMISSIONS } from '@fas/shared';
import LeadsPage from './page';

const apiMock = { leads: jest.fn(), defaultWorkflow: jest.fn(), leadSources: jest.fn() };
jest.mock('@/lib/api', () => ({
  api: new Proxy(
    {},
    {
      get: (_t, key: string) => (...args: unknown[]) =>
        apiMock[key as keyof typeof apiMock](...args),
    },
  ),
}));

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

let granted: string[] = [];
jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, can: (p: string) => granted.includes(p) }),
}));

jest.mock('@/components/Shell', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const LEAD = {
  id: 'l1',
  code: 'LEAD-1',
  title: 'Kitchen jali',
  contactName: 'Verma',
  contactPhone: '9820012345',
  client: null,
  estimatedValue: '250000',
  source: { id: 'src1', name: 'Instagram', color: '#E1306C' },
  status: { id: 'st1', name: 'New enquiry', color: '#6B7785' },
  convertedOrder: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

async function mount(items: unknown[] = [LEAD], total = items.length) {
  apiMock.leads.mockResolvedValue({ data: items, meta: { page: 1, pages: 1, total, limit: 25 } });
  render(<LeadsPage />);
  await screen.findByText('Leads');
  await waitFor(() => expect(apiMock.leads).toHaveBeenCalled());
}

const lastQuery = () => apiMock.leads.mock.calls.at(-1)![0];

beforeEach(() => {
  jest.clearAllMocks();
  granted = [PERMISSIONS.LEAD_CREATE];
  apiMock.defaultWorkflow.mockResolvedValue({
    id: 'w1',
    statuses: [{ id: 'st1', name: 'New enquiry', color: '#6B7785' }],
  });
  apiMock.leadSources.mockResolvedValue([{ id: 'src1', name: 'Instagram', color: '#E1306C' }]);
});

it('reads the enquiry pipeline, not the order flow', async () => {
  await mount();
  expect(apiMock.defaultWorkflow).toHaveBeenCalledWith('LEAD');
});

it('says how many enquiries there are', async () => {
  await mount([LEAD], 42);
  expect(screen.getByText('42 enquiries')).toBeInTheDocument();
});

it('counts one enquiry in the singular', async () => {
  await mount([LEAD], 1);
  expect(screen.getByText('1 enquiry')).toBeInTheDocument();
});

it('shows each with who it is from and where it stands', async () => {
  await mount();
  expect(screen.getByText('Kitchen jali')).toBeInTheDocument();
  expect(screen.getByText(/Verma · 9820012345/)).toBeInTheDocument();
  expect(screen.getByText('New enquiry')).toBeInTheDocument();
  expect(screen.getByText('Instagram')).toBeInTheDocument();
});

it('shows what an enquiry might be worth', async () => {
  await mount();
  expect(screen.getByText('₹2,50,000')).toBeInTheDocument();
});

it('shows the order a converted enquiry became instead', async () => {
  await mount([{ ...LEAD, convertedOrder: { id: 'o1', code: 'ORD-9' } }]);
  expect(screen.getByText('→ ORD-9')).toBeInTheDocument();
  expect(screen.queryByText('₹2,50,000')).not.toBeInTheDocument();
});

it('says so when nothing matches', async () => {
  await mount([]);
  expect(screen.getByText('No enquiries match')).toBeInTheDocument();
});

describe('the ways out of the list', () => {
  it('opens the board, the same pipeline arranged differently', async () => {
    await mount();
    fireEvent.click(screen.getByText('Board'));
    expect(push).toHaveBeenCalledWith('/leads/board');
  });

  it('opens the archive of enquiries that went quiet', async () => {
    await mount();
    fireEvent.click(screen.getByText('Archived'));
    expect(push).toHaveBeenCalledWith('/leads/archived');
  });

  it('offers a new enquiry to somebody who may take one', async () => {
    await mount();
    expect(screen.getByText('New lead')).toBeInTheDocument();
  });

  it('offers it to nobody else', async () => {
    granted = [];
    await mount();
    expect(screen.queryByText('New lead')).not.toBeInTheDocument();
  });
});

describe('searching and filtering', () => {
  it('searches on what was typed', async () => {
    await mount();
    fireEvent.change(screen.getByPlaceholderText('Name, phone or what it is for'), {
      target: { value: 'verma' },
    });
    await waitFor(() => expect(lastQuery().search).toBe('verma'));
  });

  it('filters by stage and source together', async () => {
    await mount();
    fireEvent.click(screen.getByText('Filter'));
    fireEvent.click((await screen.findAllByText('New enquiry')).at(-1)!);
    fireEvent.click(screen.getAllByText('Instagram').at(-1)!);
    fireEvent.click(screen.getByText('Apply 2 filters'));
    await waitFor(() => expect(lastQuery().statusId).toBe('st1'));
    expect(lastQuery().sourceId).toBe('src1');
  });
});
