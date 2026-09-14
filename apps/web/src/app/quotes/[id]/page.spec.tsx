import { Suspense } from 'react';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PERMISSIONS } from '@fas/shared';
import EstimatePage from './page';

const apiMock = {
  estimate: jest.fn(),
  setEstimateStatus: jest.fn(),
  convertEstimate: jest.fn(),
  history: jest.fn(),
};
jest.mock('@/lib/api', () => ({
  api: new Proxy(
    {},
    {
      get: (_t, key: string) => (...args: unknown[]) =>
        apiMock[key as keyof typeof apiMock](...args),
    },
  ),
}));
jest.mock('@/lib/documents', () => ({ openDocument: jest.fn() }));
import { openDocument } from '@/lib/documents';

const push = jest.fn();
let editing = false;
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(editing ? 'edit=1' : ''),
}));

/** The edit view is the shared form, which has its own spec. */
jest.mock('@/components/EstimateForm', () => ({
  EstimateForm: ({ estimateId }: { estimateId: string }) => (
    <div data-testid="form">{estimateId}</div>
  ),
}));

let granted: string[] = [];
jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, can: (p: string) => granted.includes(p) }),
}));

jest.mock('@/components/Shell', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const ITEM = {
  id: 'i1',
  name: 'Jali cutting',
  hsnSac: '4412',
  quantity: '10',
  unit: 'Sqf',
  ratePerUnit: '500',
  discountAmount: '500',
  discountPct: '10',
  taxAmount: '810',
  gstRatePct: '18',
  amount: '5310',
};

const ESTIMATE = {
  id: 'e1',
  code: 'EST-1',
  clientId: 'c1',
  client: { name: 'Verma Interiors' },
  clientName: null,
  status: 'SENT',
  items: [ITEM],
  subtotal: '5000',
  discount: '500',
  total: '4500',
  taxAmount: '810',
  igst: '0',
  sgst: '405',
  cgst: '405',
  grandTotal: '5310',
  savedAmount: '0',
  issuedOn: '2026-09-01T00:00:00.000Z',
  validTill: '2026-09-15T00:00:00.000Z',
  orderId: null,
};

const field = (label: string) =>
  Array.from(document.querySelectorAll('label.field'))
    .find((node) => node.querySelector('.field-label')?.textContent?.startsWith(label))!
    .querySelector('input') as HTMLInputElement;

const open = async (estimate: unknown = ESTIMATE) => {
  apiMock.estimate.mockResolvedValue(estimate);
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <EstimatePage params={Promise.resolve({ id: 'e1' })} />
      </Suspense>,
    );
  });
};

async function mount(estimate: unknown = ESTIMATE) {
  await open(estimate);
  await screen.findByText('EST-1');
}

beforeEach(() => {
  jest.clearAllMocks();
  editing = false;
  granted = [PERMISSIONS.ESTIMATE_MANAGE];
  apiMock.setEstimateStatus.mockResolvedValue({});
  apiMock.history.mockResolvedValue([]);
  apiMock.convertEstimate.mockResolvedValue({ id: 'o9' });
});

it('says it is loading rather than showing an empty quote', async () => {
  apiMock.estimate.mockReturnValue(new Promise(() => {}));
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <EstimatePage params={Promise.resolve({ id: 'e1' })} />
      </Suspense>,
    );
  });
  expect(await screen.findByText('Loading estimate')).toBeInTheDocument();
});

it('leads with the number, the client and where the quote stands', async () => {
  await mount();
  expect(screen.getByText('EST-1')).toBeInTheDocument();
  expect(screen.getByText('Verma Interiors')).toBeInTheDocument();
  expect(screen.getByText('SENT')).toBeInTheDocument();
});

it('falls back to the typed name for a quote with no client record', async () => {
  await mount({ ...ESTIMATE, client: null, clientName: 'Walk-in' });
  expect(screen.getByText('Walk-in')).toBeInTheDocument();
});

it('opens the document the server renders', async () => {
  await mount();
  fireEvent.click(screen.getByText('Open the PDF'));
  // The same markup the app turns into a PDF on the phone.
  expect(openDocument).toHaveBeenCalledWith('/estimates/e1/document');
});

describe('the money', () => {
  it('leads with what the client pays', async () => {
    await mount();
    expect(screen.getByText('Client pays')).toBeInTheDocument();
    expect(screen.getAllByText('₹5,310').length).toBeGreaterThan(0);
  });

  it('splits the tax the way the client’s state demands', async () => {
    await mount();
    expect(screen.getByText('SGST')).toBeInTheDocument();
    expect(screen.getByText('CGST')).toBeInTheDocument();
    expect(screen.queryByText('IGST')).not.toBeInTheDocument();
  });

  it('shows a single IGST line for a client in another state', async () => {
    await mount({ ...ESTIMATE, igst: '810', sgst: '0', cgst: '0' });
    expect(screen.getByText('IGST')).toBeInTheDocument();
    expect(screen.queryByText('SGST')).not.toBeInTheDocument();
  });

  it('shows the discount as its own line when there is one', async () => {
    await mount();
    // Once as the table's column head, once as the totals line.
    expect(screen.getAllByText('Discount')).toHaveLength(2);
  });

  it('leaves the discount line out when nothing was taken off', async () => {
    await mount({ ...ESTIMATE, discount: '0' });
    expect(screen.getAllByText('Discount')).toHaveLength(1);
  });

  it('says what the client saved where the shop absorbed something', async () => {
    await mount({ ...ESTIMATE, savedAmount: '810' });
    expect(screen.getByText('You saved')).toBeInTheDocument();
  });

  it('says when the quote was issued and how long it stands', async () => {
    await mount();
    expect(screen.getByText(/valid till/)).toBeInTheDocument();
  });

  it('says nothing about an expiry the quote does not have', async () => {
    await mount({ ...ESTIMATE, validTill: null });
    expect(screen.queryByText(/valid till/)).not.toBeInTheDocument();
  });
});

describe('the lines', () => {
  it('shows each with its rate, discount, tax and amount', async () => {
    await mount();
    expect(screen.getByText('Jali cutting')).toBeInTheDocument();
    expect(screen.getByText('HSN 4412')).toBeInTheDocument();
    // The rate, the discount off the line, and the discount in the totals.
    expect(screen.getAllByText('₹500')).toHaveLength(3);
    expect(screen.getByText('10%')).toBeInTheDocument();
    expect(screen.getByText('18%')).toBeInTheDocument();
  });
});

describe('what can be done with it', () => {
  it('offers nothing to somebody who may only read', async () => {
    granted = [];
    await mount();
    expect(screen.queryByText('Actions')).not.toBeInTheDocument();
    expect(screen.queryByText('Change status')).not.toBeInTheDocument();
  });

  it('opens it for editing', async () => {
    await mount();
    fireEvent.click(screen.getByText('Edit'));
    expect(push).toHaveBeenCalledWith('/quotes/e1?edit=1');
  });

  it('changes the status and re-reads it', async () => {
    await mount();
    fireEvent.click(screen.getByText('Change status'));
    fireEvent.click((await screen.findAllByText('ACCEPTED')).at(-1)!);
    await waitFor(() => expect(apiMock.setEstimateStatus).toHaveBeenCalledWith('e1', 'ACCEPTED'));
    await waitFor(() => expect(apiMock.estimate).toHaveBeenCalledTimes(2));
  });
});

describe('turning it into an order', () => {
  it('cannot happen until the quote belongs to a client', async () => {
    await mount({ ...ESTIMATE, clientId: null });
    expect(screen.queryByText('Turn into an order')).not.toBeInTheDocument();
    expect(
      screen.getByText('Attach this estimate to a client before it can become an order.'),
    ).toBeInTheDocument();
  });

  it('says the estimate stays as the record of what was quoted', async () => {
    await mount();
    fireEvent.click(screen.getByText('Turn into an order'));
    expect(await screen.findByText(/The estimate stays as the record/)).toBeInTheDocument();
    expect(screen.getByText('₹5,310 carries across unchanged')).toBeInTheDocument();
  });

  it('needs a site before it will create anything', async () => {
    await mount();
    fireEvent.click(screen.getByText('Turn into an order'));
    fireEvent.click(await screen.findByText('Create the order'));
    expect(apiMock.convertEstimate).not.toHaveBeenCalled();
  });

  it('creates the order and opens it', async () => {
    await mount();
    fireEvent.click(screen.getByText('Turn into an order'));
    await screen.findByText('Create the order');
    fireEvent.change(field('Site'), { target: { value: ' Andheri ' } });
    fireEvent.click(screen.getByText('Create the order'));
    await waitFor(() =>
      expect(apiMock.convertEstimate).toHaveBeenCalledWith('e1', { location: 'Andheri' }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith('/orders/o9'));
  });

  it('says why a conversion was refused', async () => {
    apiMock.convertEstimate.mockRejectedValue(new Error('Already converted'));
    await mount();
    fireEvent.click(screen.getByText('Turn into an order'));
    await screen.findByText('Create the order');
    fireEvent.change(field('Site'), { target: { value: 'Andheri' } });
    fireEvent.click(screen.getByText('Create the order'));
    expect(await screen.findByText('Already converted')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('offers the order instead once the quote has become one', async () => {
    await mount({ ...ESTIMATE, status: 'CONVERTED', orderId: 'o5' });
    expect(screen.queryByText('Turn into an order')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Open the order'));
    expect(push).toHaveBeenCalledWith('/orders/o5');
  });
});

describe('editing', () => {
  it('shows the quote itself by default', async () => {
    await mount();
    expect(screen.queryByTestId('form')).not.toBeInTheDocument();
  });

  it('shows the form when the address says so, on the same URL', async () => {
    editing = true;
    await open();
    // Edit is a mode of the same page, so Back returns to the quote.
    expect(await screen.findByTestId('form')).toHaveTextContent('e1');
  });
});

describe('the enquiry it was quoted for', () => {
  const LEAD = {
    id: 'ld1',
    code: 'LEAD-1',
    title: 'Kitchen jali',
    status: { id: 's1', name: 'Quoted', color: '#D29922' },
  };

  it('says which enquiry it belongs to', async () => {
    await mount({ ...ESTIMATE, leadId: 'ld1', lead: LEAD });
    expect(screen.getByText('Quoted for')).toBeInTheDocument();
    expect(screen.getByText('Kitchen jali')).toBeInTheDocument();
    expect(screen.getByText('LEAD-1 · Quoted')).toBeInTheDocument();
  });

  it('opens the enquiry', async () => {
    await mount({ ...ESTIMATE, leadId: 'ld1', lead: LEAD });
    fireEvent.click(screen.getByText('Kitchen jali'));
    expect(push).toHaveBeenCalledWith('/leads?lead=ld1');
  });

  it('says nothing on a quote written for somebody who rang up', async () => {
    await mount();
    expect(screen.queryByText('Quoted for')).not.toBeInTheDocument();
  });
});
