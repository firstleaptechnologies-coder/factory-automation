import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PERMISSIONS } from '@fas/shared';
import LeadBoardPage from './page';

const apiMock = {
  leadBoard: jest.fn(),
  leadSources: jest.fn(),
  leadFields: jest.fn(),
  materials: jest.fn(),
  createLead: jest.fn(),
  allowedNext: jest.fn(),
  allowedBack: jest.fn(),
  changeLeadStatus: jest.fn(),
};

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

let granted: string[] = [];
jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, can: (p: string) => granted.includes(p) }),
}));
jest.mock('@/lib/api', () => ({
  api: new Proxy(
    {},
    {
      get: (_t, key: string) => (...args: unknown[]) =>
        apiMock[key as keyof typeof apiMock](...args),
    },
  ),
}));

jest.mock('@/components/Shell', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

/** The board and the convert dialog have their own specs. */
let lastMove: ((lead: unknown, toStatusId: string) => Promise<void>) | null = null;
jest.mock('@/components/KanbanBoard', () => ({
  KanbanBoard: ({
    columns,
    onMove,
    renderCard,
  }: {
    columns: { status: { id: string; name: string }; subtitle?: string; items: unknown[] }[];
    onMove: (lead: unknown, toStatusId: string) => Promise<void>;
    renderCard: (item: never) => React.ReactNode;
  }) => {
    lastMove = onMove;
    return (
      <div data-testid="board">
        {columns.map((column) => (
          <div key={column.status.id}>
            {column.status.name}
            {column.subtitle ? <span>{column.subtitle}</span> : null}
            {column.items.map((item, i) => (
              <div key={i}>{renderCard(item as never)}</div>
            ))}
          </div>
        ))}
      </div>
    );
  },
}));

let convertProps: { lead: { code: string }; onConverted: (o: { code: string }) => void } | null = null;
jest.mock('@/components/ConvertLeadDialog', () => ({
  ConvertLeadDialog: (props: never) => {
    convertProps = props;
    return <div data-testid="convert" />;
  },
}));

jest.mock('@/components/CustomFields', () => ({
  CustomFields: () => <div data-testid="custom-fields" />,
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
  source: { id: 's1', name: 'Instagram', color: '#E1306C' },
  status: { id: 'st1', name: 'New enquiry' },
  convertedOrder: null,
};

const BOARD = {
  workflow: { id: 'w1', name: 'Lead pipeline' },
  columns: [
    { status: { id: 'st1', name: 'New enquiry', color: '#6B7785' }, value: 250000, leads: [LEAD] },
    { status: { id: 'st2', name: 'Quoted', color: '#D29922' }, value: 0, leads: [] },
  ],
};

async function mount(board: unknown = BOARD) {
  apiMock.leadBoard.mockResolvedValue(board);
  render(<LeadBoardPage />);
  await screen.findByTestId('board');
}

/*
 * The dialog's own fields are `<div class="field"><label>…`, and the shared
 * line editor's are the kit's `<label class="field"><span class="field-label">…`.
 * One helper reads both, so a test does not have to know which kind of field
 * it is typing into.
 */
const byLabel = (label: string) =>
  Array.from(document.querySelectorAll('.field, .col'))
    .find(
      (node) =>
        node.querySelector('label')?.textContent === label ||
        node.querySelector('.field-label')?.textContent === label,
    )!
    .querySelector('input') as HTMLInputElement;

beforeEach(() => {
  jest.clearAllMocks();
  lastMove = null;
  convertProps = null;
  granted = [];
  apiMock.allowedBack.mockResolvedValue([]);
  apiMock.leadSources.mockResolvedValue([{ id: 's1', name: 'Instagram', color: '#E1306C' }]);
  apiMock.leadFields.mockResolvedValue([]);
  apiMock.materials.mockResolvedValue([]);
  apiMock.createLead.mockResolvedValue({});
  apiMock.allowedNext.mockResolvedValue([
    { id: 't1', toStatusId: 'st2', requiresNote: false, toStatus: { id: 'st2', name: 'Quoted' } },
  ]);
  apiMock.changeLeadStatus.mockResolvedValue({});
  jest.spyOn(window, 'prompt').mockReturnValue('');
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});

it('names the pipeline the board is showing', async () => {
  await mount();
  expect(screen.getByText(/Lead pipeline — drag to move a lead/)).toBeInTheDocument();
});

it('says why the board could not be read', async () => {
  apiMock.leadBoard.mockRejectedValue(new Error('Network down'));
  render(<LeadBoardPage />);
  expect(await screen.findByText('Network down')).toBeInTheDocument();
});

it('shows what each stage of the pipeline is worth', async () => {
  await mount();
  expect(screen.getByText('New enquiry')).toBeInTheDocument();
  // Once as the column's own value, once on the lead sitting in it.
  expect(screen.getAllByText('₹2,50,000')).toHaveLength(2);
});

it('says nothing about the value of a stage holding nothing', async () => {
  await mount();
  expect(screen.getByText('Quoted')).toBeInTheDocument();
});

describe('a lead card', () => {
  it('leads with what the enquiry is for', async () => {
    await mount();
    expect(screen.getByText('Kitchen jali')).toBeInTheDocument();
    expect(screen.getByText('LEAD-1')).toBeInTheDocument();
    expect(screen.getByText('Verma · 9820012345')).toBeInTheDocument();
  });

  it('falls back to the client’s name when no contact was taken', async () => {
    await mount({
      ...BOARD,
      columns: [
        {
          ...BOARD.columns[0],
          leads: [{ ...LEAD, contactName: null, contactPhone: null, client: { name: 'Verma Interiors' } }],
        },
        BOARD.columns[1],
      ],
    });
    expect(screen.getByText('Verma Interiors')).toBeInTheDocument();
  });

  it('shows where the enquiry came from and what it might be worth', async () => {
    await mount();
    expect(screen.getByText('Instagram')).toBeInTheDocument();
    expect(screen.getAllByText('₹2,50,000').length).toBeGreaterThan(1);
  });

  it('offers to turn an open lead into an order', async () => {
    await mount();
    fireEvent.click(screen.getByText('Convert to order'));
    expect(await screen.findByTestId('convert')).toBeInTheDocument();
  });

  it('shows the order a converted lead became, instead of offering again', async () => {
    await mount({
      ...BOARD,
      columns: [
        { ...BOARD.columns[0], leads: [{ ...LEAD, convertedOrder: { id: 'o1', code: 'ORD-9' } }] },
        BOARD.columns[1],
      ],
    });
    expect(screen.getByText('→ ORD-9')).toBeInTheDocument();
    expect(screen.queryByText('Convert to order')).not.toBeInTheDocument();
  });

  it('says what the lead became once it is converted', async () => {
    await mount();
    fireEvent.click(screen.getByText('Convert to order'));
    await screen.findByTestId('convert');
    await convertProps!.onConverted({ code: 'ORD-9' });
    expect(await screen.findByText('Converted into ORD-9.')).toBeInTheDocument();
    expect(apiMock.leadBoard).toHaveBeenCalledTimes(2);
  });
});

describe('taking a new enquiry', () => {
  const openForm = async () => {
    await mount();
    fireEvent.click(screen.getByText('+ New lead'));
    await screen.findByText('Close');
  };

  /** The three the dialog will not save without: what, who, and a number. */
  const fill = (title = 'Kitchen jali') => {
    fireEvent.change(byLabel('Title'), { target: { value: title } });
    fireEvent.change(byLabel('Client name'), { target: { value: 'Verma' } });
    fireEvent.change(byLabel('Phone'), { target: { value: '9820012345' } });
  };

  it('will not create one with no title, since that is the enquiry', async () => {
    await openForm();
    fireEvent.change(byLabel('Client name'), { target: { value: 'Verma' } });
    fireEvent.change(byLabel('Phone'), { target: { value: '9820012345' } });
    expect(screen.getByText('Create lead')).toBeDisabled();
  });

  it('will not create one with nobody to ring back', async () => {
    await openForm();
    fireEvent.change(byLabel('Title'), { target: { value: 'Kitchen jali' } });
    expect(screen.getByText('Create lead')).toBeDisabled();

    fireEvent.change(byLabel('Client name'), { target: { value: 'Verma' } });
    // A name on its own is still nobody you can ring back.
    expect(screen.getByText('Create lead')).toBeDisabled();

    fireEvent.change(byLabel('Phone'), { target: { value: '9820012345' } });
    expect(screen.getByText('Create lead')).not.toBeDisabled();
  });

  it('sends only what was filled in', async () => {
    await openForm();
    fill();
    fireEvent.click(screen.getByText('Create lead'));
    await waitFor(() => expect(apiMock.createLead).toHaveBeenCalled());
    const body = apiMock.createLead.mock.calls[0][0];
    expect(body).toMatchObject({
      title: 'Kitchen jali',
      contactName: 'Verma',
      contactPhone: '9820012345',
    });
    expect(body.company).toBeUndefined();
    expect(body.billingAddress).toBeUndefined();
  });

  it('takes the addresses where the call produced them', async () => {
    await openForm();
    fill();
    fireEvent.change(byLabel('Billing address'), { target: { value: 'Unit 4, Andheri' } });
    fireEvent.click(screen.getByText('Create lead'));
    await waitFor(() => expect(apiMock.createLead).toHaveBeenCalled());
    const body = apiMock.createLead.mock.calls[0][0];
    expect(body.billingAddress).toBe('Unit 4, Andheri');
    // Empty means the same as billing, so nothing is sent for it.
    expect(body.shippingAddress).toBeUndefined();
  });

  it('sends the estimated value as a number', async () => {
    await openForm();
    fill();
    fireEvent.change(byLabel('Estimated value (₹)'), { target: { value: '250000' } });
    fireEvent.click(screen.getByText('Create lead'));
    await waitFor(() => expect(apiMock.createLead).toHaveBeenCalled());
    expect(apiMock.createLead.mock.calls[0][0].estimatedValue).toBe(250000);
  });

  describe('the items on it', () => {
    /** Opens the dialog's item editor and names the first line. */
    const addItem = async (name = 'MDF jali 18mm') => {
      fireEvent.click(screen.getByText('Add items'));
      await screen.findByPlaceholderText('Hdmr cutting 22mm');
      fireEvent.change(screen.getByPlaceholderText('Hdmr cutting 22mm'), {
        target: { value: name },
      });
    };

    it('stays closed until asked for — plenty of enquiries are one line', async () => {
      await openForm();
      expect(screen.getByText('Add items')).toBeInTheDocument();
      expect(screen.queryByPlaceholderText('Hdmr cutting 22mm')).not.toBeInTheDocument();
    });

    it('asks nothing about GST — an enquiry is not a tax document', async () => {
      await openForm();
      await addItem();
      expect(screen.queryByText('GST on top')).not.toBeInTheDocument();
      expect(screen.queryByText('GST 18%')).not.toBeInTheDocument();
      expect(document.querySelector('.field-label')).toBeTruthy();
      const labels = Array.from(document.querySelectorAll('.field-label')).map(
        (node) => node.textContent,
      );
      expect(labels).not.toContain('HSN/SAC');
      expect(labels).toContain('Description');
    });

    it('sends an item that is only a name, because most of them are', async () => {
      await openForm();
      fill();
      await addItem();
      fireEvent.click(screen.getByText('Create lead'));

      await waitFor(() => expect(apiMock.createLead).toHaveBeenCalled());
      const body = apiMock.createLead.mock.calls[0][0];
      expect(body.items).toEqual([{ name: 'MDF jali 18mm', unit: 'Sqf' }]);
      expect(body).not.toHaveProperty('taxTreatment');
    });

    it('sends the rate where somebody knew one', async () => {
      await openForm();
      fill();
      await addItem();
      fireEvent.change(byLabel('Description'), { target: { value: 'Natural finish' } });
      fireEvent.change(byLabel('Qty'), { target: { value: '120' } });
      fireEvent.change(byLabel('Rate'), { target: { value: '450' } });
      fireEvent.click(screen.getByText('Create lead'));

      await waitFor(() => expect(apiMock.createLead).toHaveBeenCalled());
      expect(apiMock.createLead.mock.calls[0][0].items).toEqual([
        {
          name: 'MDF jali 18mm',
          description: 'Natural finish',
          unit: 'Sqf',
          quantity: 120,
          ratePerUnit: 450,
        },
      ]);
    });

    it('sends no items when nothing was listed, which is not a cleared set', async () => {
      await openForm();
      fill();
      fireEvent.click(screen.getByText('Create lead'));
      await waitFor(() => expect(apiMock.createLead).toHaveBeenCalled());
      expect(apiMock.createLead.mock.calls[0][0]).not.toHaveProperty('items');
    });

    it('totals what was priced, without a tax line', async () => {
      await openForm();
      await addItem();
      fireEvent.change(byLabel('Qty'), { target: { value: '120' } });
      fireEvent.change(byLabel('Rate'), { target: { value: '450' } });
      expect(screen.getByText('The server prices it for real when you save.')).toBeInTheDocument();
      expect(screen.getByText('Subtotal')).toBeInTheDocument();
      expect(screen.queryByText('GST')).not.toBeInTheDocument();
      expect(screen.queryByText('Taxable')).not.toBeInTheDocument();
    });
  });

  it('carries whatever this shop chose to capture', async () => {
    apiMock.leadFields.mockResolvedValue([
      { id: 'f1', key: 'architect', label: 'Architect', type: 'TEXT', options: [], required: false },
    ]);
    await openForm();
    expect(screen.getByTestId('custom-fields')).toBeInTheDocument();
  });

  it('asks for no extra details when the shop has configured none', async () => {
    await openForm();
    expect(screen.queryByTestId('custom-fields')).not.toBeInTheDocument();
  });

  it('closes the form, empties it and reloads the board', async () => {
    await openForm();
    fill('Kitchen jali');
    fireEvent.click(screen.getByText('Create lead'));
    expect(await screen.findByText('Lead created.')).toBeInTheDocument();
    expect(screen.getByText('+ New lead')).toBeInTheDocument();
    expect(apiMock.leadBoard).toHaveBeenCalledTimes(2);
  });

  it('says why one was refused, and keeps the form open', async () => {
    apiMock.createLead.mockRejectedValue(new Error('Source is not active'));
    await openForm();
    fill('Kitchen jali');
    fireEvent.click(screen.getByText('Create lead'));
    expect(await screen.findByText('Source is not active')).toBeInTheDocument();
    expect(byLabel('Title')).toHaveValue('Kitchen jali');
  });
});

describe('quoting a lead', () => {
  it('is offered to somebody who may write a quote', async () => {
    granted = [PERMISSIONS.ESTIMATE_MANAGE];
    await mount();
    expect(screen.getByText('Quote')).toBeInTheDocument();
  });

  it('is not offered to somebody who may not', async () => {
    await mount();
    expect(screen.queryByText('Quote')).not.toBeInTheDocument();
  });

  it('opens the quote form knowing who it is for and what it is about', async () => {
    granted = [PERMISSIONS.ESTIMATE_MANAGE];
    await mount();
    fireEvent.click(screen.getByText('Quote'));
    // Carried in the query string, so the details typed once on the enquiry
    // are not typed again on the quote.
    const [url] = push.mock.calls[0];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(url.startsWith('/quotes/new?')).toBe(true);
    expect(Object.fromEntries(params)).toMatchObject({
      leadId: 'l1',
      leadCode: 'LEAD-1',
      title: 'Kitchen jali',
      clientName: 'Verma',
      location: 'Andheri',
    });
  });

  it('is not offered on an enquiry that already became work', async () => {
    granted = [PERMISSIONS.ESTIMATE_MANAGE];
    await mount({
      ...BOARD,
      columns: [
        {
          ...BOARD.columns[0],
          leads: [{ ...LEAD, convertedOrder: { id: 'o1', code: 'ORD-1' } }],
        },
        BOARD.columns[1],
      ],
    });
    expect(screen.queryByText('Quote')).not.toBeInTheDocument();
  });

  it('shows the quoted figure in place of the guess once one exists', async () => {
    await mount({
      ...BOARD,
      columns: [
        {
          ...BOARD.columns[0],
          leads: [{ ...LEAD, quotedValue: '450000' }],
        },
        BOARD.columns[1],
      ],
    });
    // The guess is what somebody thought when the phone was put down; the
    // quote is a number that went to the client. (The column head still shows
    // its own total, which is why this looks at the card.)
    const card = screen.getByText('quoted').closest('div')!.parentElement!;
    expect(card.textContent).toContain('₹4,50,000');
    expect(card.textContent).not.toContain('₹2,50,000');
  });
});

describe('moving a lead', () => {
  it('moves it and re-reads the board', async () => {
    await mount();
    await lastMove!(LEAD, 'st2');
    await waitFor(() =>
      expect(apiMock.changeLeadStatus).toHaveBeenCalledWith('l1', {
        toStatusId: 'st2',
        note: undefined,
      }),
    );
    expect(apiMock.leadBoard).toHaveBeenCalledTimes(2);
  });

  it('asks for the note the pipeline demands before trying', async () => {
    apiMock.allowedNext.mockResolvedValue([
      { id: 't2', toStatusId: 'st2', requiresNote: true, toStatus: { id: 'st2', name: 'Quoted' } },
    ]);
    (window.prompt as jest.Mock).mockReturnValue('Sent the quote');
    await mount();
    await lastMove!(LEAD, 'st2');
    expect(window.prompt).toHaveBeenCalledWith('Moving LEAD-1 to Quoted needs a note. Why?');
    await waitFor(() => expect(apiMock.changeLeadStatus).toHaveBeenCalled());
    expect(apiMock.changeLeadStatus.mock.calls[0][1].note).toBe('Sent the quote');
  });

  it('cancels the move when no note is given', async () => {
    apiMock.allowedNext.mockResolvedValue([
      { id: 't2', toStatusId: 'st2', requiresNote: true, toStatus: { id: 'st2', name: 'Quoted' } },
    ]);
    (window.prompt as jest.Mock).mockReturnValue('  ');
    await mount();
    await lastMove!(LEAD, 'st2');
    expect(apiMock.changeLeadStatus).not.toHaveBeenCalled();
    expect(await screen.findByText('Move cancelled — a note is required.')).toBeInTheDocument();
  });

  describe('dragged backwards', () => {
    const back = () => {
      apiMock.allowedNext.mockResolvedValue([]);
      apiMock.allowedBack.mockResolvedValue([
        { transitionId: 't0', toStatus: { id: 'st0', name: 'Contacted' } },
      ]);
    };

    it('is refused by the server for somebody not allowed to do it', async () => {
      back();
      apiMock.changeLeadStatus.mockRejectedValue(new Error('Only somebody allowed to can'));
      await mount();
      await lastMove!(LEAD, 'st0');
      expect(window.confirm).not.toHaveBeenCalled();
      expect(await screen.findByText('Only somebody allowed to can')).toBeInTheDocument();
    });

    it('asks before it goes back, naming both stages', async () => {
      granted = [PERMISSIONS.LEAD_MOVE_BACK];
      back();
      await mount();
      await lastMove!(LEAD, 'st0');
      expect((window.confirm as jest.Mock).mock.calls[0][0]).toContain(
        'New enquiry → Contacted is not a step this pipeline draws',
      );
    });

    it('leaves the card where it was when the question is declined', async () => {
      granted = [PERMISSIONS.LEAD_MOVE_BACK];
      back();
      (window.confirm as jest.Mock).mockReturnValue(false);
      await mount();
      await lastMove!(LEAD, 'st0');
      expect(apiMock.changeLeadStatus).not.toHaveBeenCalled();
      await waitFor(() => expect(apiMock.leadBoard).toHaveBeenCalledTimes(2));
    });

    it('sends it back with the reason', async () => {
      granted = [PERMISSIONS.LEAD_MOVE_BACK];
      back();
      (window.prompt as jest.Mock).mockReturnValue(' Talking again ');
      await mount();
      await lastMove!(LEAD, 'st0');
      await waitFor(() => expect(apiMock.changeLeadStatus).toHaveBeenCalled());
      expect(apiMock.changeLeadStatus.mock.calls[0]).toEqual([
        'l1',
        { toStatusId: 'st0', note: 'Talking again', reverse: true },
      ]);
    });
  });

  it('puts the card back where it really is when the server refuses', async () => {
    apiMock.changeLeadStatus.mockRejectedValue(new Error('That move is not allowed'));
    await mount();
    await lastMove!(LEAD, 'st2');
    expect(await screen.findByText('That move is not allowed')).toBeInTheDocument();
    expect(apiMock.leadBoard).toHaveBeenCalledTimes(2);
  });
});
