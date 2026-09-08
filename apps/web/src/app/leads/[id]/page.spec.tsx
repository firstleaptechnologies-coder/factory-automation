import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { PERMISSIONS } from '@decor/shared';
import LeadPage from './page';

const apiMock: Record<string, jest.Mock> = {
  lead: jest.fn(),
  leadFields: jest.fn(),
  materials: jest.fn(),
  allowedNext: jest.fn(),
  allowedBack: jest.fn(),
  changeLeadStatus: jest.fn(),
};
jest.mock('@/lib/api', () => ({
  api: new Proxy({}, { get: (_t, key: string) => (...args: unknown[]) => apiMock[key](...args) }),
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

let convertProps: Record<string, unknown> | null = null;
jest.mock('@/components/ConvertLeadDialog', () => ({
  ConvertLeadDialog: (props: Record<string, unknown>) => {
    convertProps = props;
    return <div data-testid="convert-dialog" />;
  },
}));

const LEAD = {
  id: 'l1',
  code: 'LD-2627-0001',
  title: 'Kitchen jali',
  createdAt: '2026-09-01T10:00:00Z',
  estimatedValue: '250000',
  quotedValue: null,
  status: { id: 's1', name: 'Quoted', color: '#D29922' },
  source: { id: 'src1', name: 'Referral' },
  contactName: 'Verma',
  contactPhone: '9820012345',
  company: 'Verma & Sons',
  location: 'Andheri',
  owner: { id: 'u2', name: 'Ravi' },
  client: null,
  convertedOrder: null,
  convertedAt: null,
  notes: 'Wants it before Diwali',
  customFields: { architect: 'Rao' },
  estimates: [],
  statusHistory: [
    {
      id: 'h1',
      changedAt: '2026-09-01T10:00:00Z',
      fromStatus: null,
      toStatus: { id: 's0', name: 'New enquiry', color: '#8B949E' },
      note: 'Lead created',
      changedBy: { id: 'u1', name: 'Nakul' },
    },
  ],
};

async function mount(over: Record<string, unknown> = {}) {
  apiMock.lead.mockResolvedValue({ ...LEAD, ...over });
  await act(async () => {
    render(<LeadPage params={Promise.resolve({ id: 'l1' })} />);
  });
  await screen.findByText('Kitchen jali');
}

beforeEach(() => {
  jest.clearAllMocks();
  convertProps = null;
  granted = [PERMISSIONS.LEAD_VIEW, PERMISSIONS.LEAD_CONVERT, PERMISSIONS.ESTIMATE_MANAGE];
  apiMock.leadFields.mockResolvedValue([
    { id: 'f1', key: 'architect', label: 'Architect', type: 'TEXT', options: [] },
  ]);
  apiMock.materials.mockResolvedValue([]);
  apiMock.allowedNext.mockResolvedValue([
    { id: 't1', toStatusId: 's2', requiresNote: false, label: null, toStatus: { id: 's2', name: 'Won', color: '#2EA043' } },
  ]);
  apiMock.allowedBack.mockResolvedValue([]);
  apiMock.changeLeadStatus.mockResolvedValue({});
});

it('opens the enquiry rather than the whole pipeline', async () => {
  await mount();
  // Clicking a lead used to drop you on the board, which answers a different
  // question from the one being asked.
  expect(screen.getByText('Kitchen jali')).toBeInTheDocument();
  expect(screen.getByText(/LD-2627-0001/)).toBeInTheDocument();
});

it('says who it is from and where', async () => {
  await mount();
  expect(screen.getByText('Verma')).toBeInTheDocument();
  expect(screen.getByText('9820012345')).toBeInTheDocument();
  expect(screen.getByText('Verma & Sons')).toBeInTheDocument();
  expect(screen.getByText('Andheri')).toBeInTheDocument();
  expect(screen.getByText('Ravi')).toBeInTheDocument();
});

it('leads with the guess until a quote has gone out', async () => {
  await mount();
  expect(screen.getByText('Estimated')).toBeInTheDocument();
  expect(screen.getByText('₹2,50,000')).toBeInTheDocument();
});

it('leads with what was quoted once one has', async () => {
  await mount({ quotedValue: '450000' });
  // "Quoted" twice: the label above the figure, and the stage it is at.
  expect(screen.getAllByText('Quoted').length).toBe(2);
  expect(screen.getByText('₹4,50,000')).toBeInTheDocument();
});

it('shows what the shop chose to capture', async () => {
  await mount();
  expect(screen.getByText('Architect')).toBeInTheDocument();
  expect(screen.getByText('Rao')).toBeInTheDocument();
});

it('says nothing about fields nobody filled in', async () => {
  await mount({ customFields: {} });
  expect(screen.queryByText('Architect')).not.toBeInTheDocument();
});

it('reads the history, including a step that went back', async () => {
  await mount({
    statusHistory: [
      {
        id: 'h9',
        changedAt: '2026-09-02T10:00:00Z',
        fromStatus: { id: 's1', name: 'Quoted', color: '#D29922' },
        toStatus: { id: 's0', name: 'Contacted', color: '#2F81F7' },
        note: 'Talking again',
        reversed: true,
        changedBy: { id: 'u1', name: 'Nakul' },
      },
    ],
  });
  expect(screen.getByText('· went back')).toBeInTheDocument();
  expect(screen.getByText('Talking again')).toBeInTheDocument();
});

describe('the quotes on it', () => {
  const QUOTES = [
    {
      id: 'e1',
      code: 'EST-2627-0001',
      status: 'SENT',
      grandTotal: '450000',
      issuedOn: '2026-09-02T10:00:00Z',
      orderId: null,
    },
  ];

  it('lists them with what each came to', async () => {
    await mount({ estimates: QUOTES });
    expect(screen.getByText('EST-2627-0001')).toBeInTheDocument();
    expect(screen.getByText('₹4,50,000')).toBeInTheDocument();
  });

  it('opens one', async () => {
    await mount({ estimates: QUOTES });
    fireEvent.click(screen.getByTestId('quote-e1'));
    expect(push).toHaveBeenCalledWith('/quotes/e1');
  });

  it('says plainly when nothing has been quoted', async () => {
    await mount();
    expect(screen.getByText('Nothing quoted yet')).toBeInTheDocument();
  });

  it('offers to write one, carrying the enquiry with it', async () => {
    await mount();
    fireEvent.click(screen.getByText('Quote this enquiry'));
    const [url] = push.mock.calls[0];
    expect(url.startsWith('/quotes/new?')).toBe(true);
    expect(Object.fromEntries(new URLSearchParams(url.split('?')[1]))).toMatchObject({
      leadId: 'l1',
      leadCode: 'LD-2627-0001',
      title: 'Kitchen jali',
      clientName: 'Verma',
    });
  });
});

describe('turning it into work', () => {
  it('offers conversion while it is still open', async () => {
    await mount();
    fireEvent.click(screen.getByText('Convert to an order'));
    expect(screen.getByTestId('convert-dialog')).toBeInTheDocument();
  });

  it('goes to the order it became', async () => {
    await mount();
    fireEvent.click(screen.getByText('Convert to an order'));
    await act(async () => {
      await (convertProps!.onConverted as (o: unknown) => Promise<void>)({ id: 'o1' });
    });
    expect(push).toHaveBeenCalledWith('/orders/o1');
  });

  it('shows the order instead once it is converted', async () => {
    await mount({ convertedOrder: { id: 'o9', code: 'ORD-9' }, convertedAt: '2026-09-03T10:00:00Z' });
    expect(screen.getByText('Open ORD-9')).toBeInTheDocument();
    expect(screen.queryByText('Convert to an order')).not.toBeInTheDocument();
  });
});

describe('moving it along', () => {
  it('offers exactly the moves the pipeline draws', async () => {
    await mount();
    fireEvent.click(screen.getByText('Move stage'));
    expect(await screen.findByText('Move to Won')).toBeInTheDocument();
  });

  it('moves it', async () => {
    await mount();
    fireEvent.click(screen.getByText('Move stage'));
    fireEvent.click(await screen.findByText('Won'));
    await waitFor(() => expect(apiMock.changeLeadStatus).toHaveBeenCalled());
    expect(apiMock.changeLeadStatus.mock.calls[0]).toEqual([
      'l1',
      { toStatusId: 's2', note: undefined },
    ]);
  });

  it('does not ask about going back unless somebody may', async () => {
    apiMock.allowedBack.mockResolvedValue([
      { transitionId: 't0', toStatus: { id: 's0', name: 'Contacted', color: '#2F81F7' } },
    ]);
    await mount();
    fireEvent.click(screen.getByText('Move stage'));
    await screen.findByText('Move to Won');
    // Not even asked for: the answer would be unusable.
    expect(apiMock.allowedBack).not.toHaveBeenCalled();
  });

  it('offers a step back to somebody who may, and asks first', async () => {
    granted = [...granted, PERMISSIONS.LEAD_MOVE_BACK];
    apiMock.allowedBack.mockResolvedValue([
      { transitionId: 't0', toStatus: { id: 's0', name: 'Contacted', color: '#2F81F7' } },
    ]);
    await mount();
    fireEvent.click(screen.getByText('Move stage'));
    fireEvent.click(await screen.findByText('Back to Contacted'));
    expect(await screen.findByText(/is not a step/)).toBeInTheDocument();
    expect(apiMock.changeLeadStatus).not.toHaveBeenCalled();
  });

  it('says out loud that it is a reversal when it sends it', async () => {
    granted = [...granted, PERMISSIONS.LEAD_MOVE_BACK];
    apiMock.allowedBack.mockResolvedValue([
      { transitionId: 't0', toStatus: { id: 's0', name: 'Contacted', color: '#2F81F7' } },
    ]);
    await mount();
    fireEvent.click(screen.getByText('Move stage'));
    fireEvent.click(await screen.findByText('Back to Contacted'));
    fireEvent.click(await screen.findByText('Yes, move it back'));
    await waitFor(() => expect(apiMock.changeLeadStatus).toHaveBeenCalled());
    expect(apiMock.changeLeadStatus.mock.calls[0][1]).toMatchObject({
      toStatusId: 's0',
      reverse: true,
    });
  });

  it('shows the server’s refusal rather than pretending it moved', async () => {
    apiMock.changeLeadStatus.mockRejectedValue(new Error('That move is not allowed'));
    await mount();
    fireEvent.click(screen.getByText('Move stage'));
    fireEvent.click(await screen.findByText('Won'));
    expect(await screen.findByText('That move is not allowed')).toBeInTheDocument();
  });
});

it('offers the way back to the list', async () => {
  await mount();
  fireEvent.click(screen.getByText('Back to leads'));
  expect(push).toHaveBeenCalledWith('/leads');
});

it('keeps the heading and its actions in view while the enquiry scrolls', () => {
  // An enquiry with its quotes and its history under it is long enough that
  // the way to move it along was a scroll back to the top away.
  return mount().then(() => {
    const bar = screen.getByText('Kitchen jali').closest('.sticky-bar');
    expect(bar).not.toBeNull();
    expect(bar!.textContent).toContain('Move stage');
  });
});
