import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EstimateForm } from './EstimateForm';

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const apiMock = {
  estimate: jest.fn(),
  gstSlabs: jest.fn(),
  searchClients: jest.fn(),
  createEstimate: jest.fn(),
  updateEstimate: jest.fn(),
};
jest.mock('@/lib/api', () => ({ api: new Proxy({}, { get: (_t, key: string) => (...args: unknown[]) => apiMock[key as keyof typeof apiMock](...args) }) }));

const SLABS = [
  { id: 'g18', ratePct: 18, isDefault: true, name: '18%' },
  { id: 'g5', ratePct: 5, isDefault: false, name: '5%' },
];

const CLIENT = {
  id: 'c1',
  code: 'CLI-1',
  name: 'Verma Interiors',
  phone: '9820012345',
  billingAddress: 'Andheri',
  shippingAddress: 'Site A',
};

beforeEach(() => {
  jest.clearAllMocks();
  apiMock.gstSlabs.mockResolvedValue(SLABS);
  apiMock.searchClients.mockResolvedValue([CLIENT]);
  apiMock.createEstimate.mockResolvedValue({ id: 'e1' });
  apiMock.updateEstimate.mockResolvedValue({ id: 'e1' });
  apiMock.estimate.mockResolvedValue(null);
});

async function mount(estimateId?: string, lead?: Record<string, unknown>) {
  const view = render(<EstimateForm estimateId={estimateId} lead={lead as never} />);
  await waitFor(() => expect(apiMock.gstSlabs).toHaveBeenCalled());
  return view;
}

const fieldNamed = (label: string) =>
  Array.from(document.querySelectorAll('label.field')).find((node) =>
    node.querySelector('.field-label')?.textContent?.startsWith(label),
  )!.querySelector('input, textarea') as HTMLElement;

async function fillLine(name = 'Hdmr cutting 22mm', qty = '10', rate = '500') {
  fireEvent.change(fieldNamed('Item'), { target: { value: name } });
  fireEvent.change(fieldNamed('Qty'), { target: { value: qty } });
  fireEvent.change(fieldNamed('Rate'), { target: { value: rate } });
}

it('cannot be saved with no client and no lines', async () => {
  await mount();
  expect(screen.getAllByText('Create quote')[0].closest('button')).toBeDisabled();
});

it('cannot be saved with lines but no client', async () => {
  await mount();
  await fillLine();
  expect(screen.getAllByText('Create quote')[0].closest('button')).toBeDisabled();
});

it('cannot be saved with a client but no priced line', async () => {
  await mount();
  fireEvent.change(fieldNamed('Client'), { target: { value: 'Walk-in' } });
  expect(screen.getAllByText('Create quote')[0].closest('button')).toBeDisabled();
});

it('can be saved for a walk-in with a priced line', async () => {
  await mount();
  fireEvent.change(fieldNamed('Client'), { target: { value: 'Walk-in' } });
  await fillLine();
  expect(screen.getAllByText('Create quote')[0].closest('button')).not.toBeDisabled();
});

describe('the preview', () => {
  it('adds GST on top under the default treatment', async () => {
    await mount();
    await fillLine();
    // ₹5,000 + 18% = ₹5,900.
    await waitFor(() => expect(screen.getByText('₹5,900')).toBeInTheDocument());
  });

  it('takes GST out of the figure when it is quoted inclusive', async () => {
    await mount();
    await fillLine();
    fireEvent.click(screen.getByText('GST included'));
    await waitFor(() => expect(screen.getByText('₹5,000')).toBeInTheDocument());
  });

  it('shows a discount line only once there is one', async () => {
    await mount();
    await fillLine();
    expect(screen.queryByText('Discount')).not.toBeInTheDocument();
    fireEvent.change(fieldNamed('Disc %'), { target: { value: '10' } });
    await waitFor(() => expect(screen.getByText('Discount')).toBeInTheDocument());
  });

  it('takes the discount off before the tax', async () => {
    await mount();
    await fillLine();
    fireEvent.change(fieldNamed('Disc %'), { target: { value: '10' } });
    // ₹4,500 + 18% = ₹5,310.
    await waitFor(() => expect(screen.getByText('₹5,310')).toBeInTheDocument());
  });

  it('follows the slab chosen on the line', async () => {
    await mount();
    await fillLine();
    fireEvent.click(screen.getByText('GST 5%'));
    await waitFor(() => expect(screen.getByText('₹5,250')).toBeInTheDocument());
  });

  it('says the server prices it for real', async () => {
    await mount();
    // A figure here that the server then disagrees with would be worse than none.
    expect(screen.getByText(/server prices it for real/)).toBeInTheDocument();
  });
});

/*
 * The same control the punch page uses, so a quote and the order that comes
 * out of it land on one client rather than two records with the same phone
 * number. It used to be a plain name field beside a search-only sheet, which
 * could not add anybody at all.
 */
describe('the client', () => {
  const search = async (term: string) => {
    fireEvent.click(screen.getByLabelText('Search existing clients'));
    fireEvent.change(await screen.findByPlaceholderText('Type to search…'), {
      target: { value: term },
    });
  };

  it('fills both addresses from the chosen client', async () => {
    await mount();
    await search('verma');
    fireEvent.click(await screen.findByText('Verma Interiors'));

    expect(fieldNamed('Billing address')).toHaveValue('Andheri');
    expect(fieldNamed('Shipping address')).toHaveValue('Site A');
  });

  it('sends the id of a client who is already on file', async () => {
    await mount();
    await search('verma');
    fireEvent.click(await screen.findByText('Verma Interiors'));
    await fillLine();
    fireEvent.click(screen.getAllByText('Create quote')[0]);

    await waitFor(() => expect(apiMock.createEstimate).toHaveBeenCalled());
    expect(apiMock.createEstimate.mock.calls[0][0]).toMatchObject({ clientId: 'c1' });
    expect(apiMock.createEstimate.mock.calls[0][0].newClient).toBeUndefined();
  });

  it('adds somebody who is not on file yet, without leaving the quote', async () => {
    await mount();
    fireEvent.change(screen.getByPlaceholderText('Who is this quote for?'), {
      target: { value: 'Passing trade' },
    });
    fireEvent.change(screen.getByPlaceholderText('Optional — matches an existing client'), {
      target: { value: '9820012345' },
    });
    await fillLine();
    fireEvent.click(screen.getAllByText('Create quote')[0]);

    await waitFor(() => expect(apiMock.createEstimate).toHaveBeenCalled());
    expect(apiMock.createEstimate.mock.calls[0][0]).toMatchObject({
      newClient: { name: 'Passing trade', phone: '9820012345' },
    });
    expect(apiMock.createEstimate.mock.calls[0][0].clientId).toBeUndefined();
  });

  it('lets the chosen client be cleared and somebody else typed in', async () => {
    await mount();
    await search('verma');
    fireEvent.click(await screen.findByText('Verma Interiors'));
    fireEvent.click(screen.getByLabelText('Clear the client'));

    expect(screen.getByPlaceholderText('Who is this quote for?')).toHaveValue('');
    expect(screen.getByLabelText('Search existing clients')).toBeInTheDocument();
  });
});

describe('lines', () => {
  it('cannot remove the only line', async () => {
    await mount();
    expect(document.querySelectorAll('.btn-ghost')).toHaveLength(0);
  });

  it('adds and removes lines', async () => {
    await mount();
    fireEvent.click(screen.getByText('Add a line'));
    expect(screen.getByText('LINE 2')).toBeInTheDocument();
    fireEvent.click(document.querySelectorAll('.btn-ghost')[0]);
    expect(screen.queryByText('LINE 2')).not.toBeInTheDocument();
  });

  it('defaults the unit to square feet', async () => {
    await mount();
    const sqf = screen.getByText('Sqf');
    expect(sqf).toHaveAttribute('data-selected', 'true');
  });

  it('shows what a line comes to once it is priced', async () => {
    await mount();
    await fillLine();
    await waitFor(() =>
      expect(screen.getByText(/₹5,000.*GST 18%/)).toBeInTheDocument(),
    );
  });
});

describe('saving', () => {
  it('drops unfinished lines rather than sending empty ones', async () => {
    await mount();
    fireEvent.change(fieldNamed('Client'), { target: { value: 'Walk-in' } });
    await fillLine();
    fireEvent.click(screen.getByText('Add a line'));
    fireEvent.click(screen.getAllByText('Create quote')[0]);
    await waitFor(() => expect(apiMock.createEstimate).toHaveBeenCalled());
    expect(apiMock.createEstimate.mock.calls[0][0].items).toHaveLength(1);
  });

  it('stamps the default slab onto a line that never picked one', async () => {
    await mount();
    fireEvent.change(fieldNamed('Client'), { target: { value: 'Walk-in' } });
    await fillLine();
    fireEvent.click(screen.getAllByText('Create quote')[0]);
    await waitFor(() => expect(apiMock.createEstimate).toHaveBeenCalled());
    expect(apiMock.createEstimate.mock.calls[0][0].items[0].gstSlabId).toBe('g18');
  });

  it('sends the treatment that was chosen', async () => {
    await mount();
    fireEvent.change(fieldNamed('Client'), { target: { value: 'Walk-in' } });
    await fillLine();
    fireEvent.click(screen.getByText('GST absorbed'));
    fireEvent.click(screen.getAllByText('Create quote')[0]);
    await waitFor(() => expect(apiMock.createEstimate).toHaveBeenCalled());
    expect(apiMock.createEstimate.mock.calls[0][0].taxTreatment).toBe('ABSORBED');
  });

  it('goes to the saved estimate', async () => {
    await mount();
    fireEvent.change(fieldNamed('Client'), { target: { value: 'Walk-in' } });
    await fillLine();
    fireEvent.click(screen.getAllByText('Create quote')[0]);
    await waitFor(() => expect(push).toHaveBeenCalledWith('/quotes/e1'));
  });

  it('shows the server’s refusal and stays on the form', async () => {
    apiMock.createEstimate.mockRejectedValue(new Error('Something is wrong'));
    await mount();
    fireEvent.change(fieldNamed('Client'), { target: { value: 'Walk-in' } });
    await fillLine();
    fireEvent.click(screen.getAllByText('Create quote')[0]);
    expect(await screen.findByText('Something is wrong')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});

describe('editing an existing estimate', () => {
  const EXISTING = {
    id: 'e1',
    code: 'EST-1',
    clientId: 'c1',
    client: CLIENT,
    clientName: 'Verma Interiors',
    billingAddress: 'Andheri',
    shippingAddress: '',
    taxTreatment: 'INCLUSIVE',
    notes: 'Rush',
    items: [
      {
        id: 'i1',
        name: 'CNC jali',
        hsnSac: '4412',
        quantity: '10',
        unit: 'Sqf',
        ratePerUnit: '500',
        discountPct: '0',
        gstSlabId: 'g5',
      },
    ],
  };

  it('loads the estimate into the form', async () => {
    apiMock.estimate.mockResolvedValue(EXISTING);
    await mount('e1');
    await waitFor(() => expect(screen.getByText('Verma Interiors')).toBeInTheDocument());
    expect(fieldNamed('Item')).toHaveValue('CNC jali');
    expect(fieldNamed('Notes')).toHaveValue('Rush');
    expect(screen.getByText('EST-1')).toBeInTheDocument();
  });

  it('keeps the treatment it was quoted under', async () => {
    apiMock.estimate.mockResolvedValue(EXISTING);
    await mount('e1');
    await waitFor(() =>
      expect(screen.getByText('GST included')).toHaveAttribute('data-selected', 'true'),
    );
  });

  it('keeps a line’s own slab rather than resetting it to the default', async () => {
    apiMock.estimate.mockResolvedValue(EXISTING);
    await mount('e1');
    await waitFor(() =>
      expect(screen.getByText('GST 5%')).toHaveAttribute('data-selected', 'true'),
    );
  });

  it('updates rather than creating a second estimate', async () => {
    apiMock.estimate.mockResolvedValue(EXISTING);
    await mount('e1');
    await waitFor(() => expect(fieldNamed('Item')).toHaveValue('CNC jali'));
    fireEvent.click(screen.getAllByText('Save estimate')[0]);
    await waitFor(() => expect(apiMock.updateEstimate).toHaveBeenCalledWith('e1', expect.anything()));
    expect(apiMock.createEstimate).not.toHaveBeenCalled();
  });
});

describe('quoting an enquiry', () => {
  const LEAD = {
    id: 'ld1',
    code: 'LEAD-1',
    title: 'Kitchen jali',
    clientName: 'Verma',
    location: 'Andheri',
  };

  it('opens already knowing who it is for and what it is about', async () => {
    await mount(undefined, LEAD);
    // Typed once on the enquiry; not typed again here.
    expect(screen.getByPlaceholderText('Who is this quote for?')).toHaveValue('Verma');
    expect(fieldNamed('Billing address')).toHaveValue('Andheri');
    expect(screen.getByDisplayValue('Kitchen jali')).toBeInTheDocument();
    expect(screen.getByDisplayValue('For enquiry LEAD-1')).toBeInTheDocument();
  });

  it('sends the enquiry with the quote, so the two are linked', async () => {
    await mount(undefined, LEAD);
    await fillLine();
    fireEvent.click(screen.getAllByText('Create quote')[0]);
    await waitFor(() => expect(apiMock.createEstimate).toHaveBeenCalled());
    expect(apiMock.createEstimate.mock.calls[0][0].leadId).toBe('ld1');
  });

  it('leaves a walk-in quote unattached to any enquiry', async () => {
    await mount();
    fireEvent.change(screen.getByPlaceholderText('Who is this quote for?'), {
      target: { value: 'Passing trade' },
    });
    await fillLine();
    fireEvent.click(screen.getAllByText('Create quote')[0]);
    await waitFor(() => expect(apiMock.createEstimate).toHaveBeenCalled());
    // Most quotes are for somebody who rang up and asked for a price.
    expect(apiMock.createEstimate.mock.calls[0][0].leadId).toBeUndefined();
  });
});
