import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { PERMISSIONS } from '@fas/shared';
import { LeadDetailScreen } from './LeadDetailScreen';

let mockPermissions: string[] = [];
jest.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ can: (p: string) => mockPermissions.includes(p) }),
}));

const mockLead = jest.fn();
const mockAllowedNext = jest.fn();
const mockAllowedBack = jest.fn();
const mockChangeStatus = jest.fn();
const mockLeadFields = jest.fn();
const mockHistory = jest.fn();
jest.mock('../api/client', () => ({
  api: {
    lead: (...a: unknown[]) => mockLead(...a),
    allowedNext: (...a: unknown[]) => mockAllowedNext(...a),
    allowedBack: (...a: unknown[]) => mockAllowedBack(...a),
    changeLeadStatus: (...a: unknown[]) => mockChangeStatus(...a),
    leadFields: () => mockLeadFields(),
    history: (...a: unknown[]) => mockHistory(...a),
  },
}));

const LEAD = {
  id: 'l1',
  code: 'LEAD-1',
  title: 'Kitchen jali',
  createdAt: '2026-09-01T10:00:00Z',
  estimatedValue: '250000',
  status: { id: 's1', name: 'Quoted', color: '#D29922' },
  source: { name: 'Referral' },
  contactName: 'Verma',
  contactPhone: '9820012345',
  company: 'Verma & Sons',
  location: 'Andheri',
  owner: { name: 'Ravi' },
  client: null,
  convertedOrder: null,
  convertedAt: null,
  customFields: { architect: 'Rao' },
  statusHistory: [
    {
      id: 'h1',
      changedAt: '2026-09-01T10:00:00Z',
      fromStatus: null,
      toStatus: { name: 'New enquiry', color: '#8B949E' },
      note: 'Lead created',
      changedBy: { name: 'Ravi' },
    },
  ],
};

const navigate = jest.fn();

async function mount(over: Record<string, unknown> = {}) {
  mockLead.mockResolvedValue({ ...LEAD, ...over });
  await render(
    <LeadDetailScreen
      route={{ params: { leadId: 'l1' } }}
      navigation={{ navigate, goBack: jest.fn() }}
    />,
  );
  await screen.findByText('LEAD-1');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockHistory.mockResolvedValue([]);
  mockPermissions = [];
  mockAllowedBack.mockResolvedValue([]);
  mockAllowedNext.mockResolvedValue([
    { id: 't1', toStatusId: 's2', requiresNote: false, label: null, toStatus: { name: 'Won', color: '#2EA043' } },
    { id: 't2', toStatusId: 's9', requiresNote: true, label: 'Mark lost', toStatus: { name: 'Lost', color: '#DA3633' } },
  ]);
  mockChangeStatus.mockResolvedValue({});
  mockLeadFields.mockResolvedValue([
    { id: 'f1', key: 'architect', label: 'Architect', type: 'TEXT', options: [] },
  ]);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

it('leads with the enquiry and what it is worth', async () => {
  await mount();
  expect(screen.getByText('Kitchen jali')).toBeTruthy();
  expect(screen.getByText('₹2.50 L')).toBeTruthy();
  expect(screen.getByText('via Referral')).toBeTruthy();
});

it('shows the contact and every detail that was captured', async () => {
  await mount();
  expect(screen.getByText('Verma')).toBeTruthy();
  expect(screen.getByText('9820012345')).toBeTruthy();
  expect(screen.getByText('Verma & Sons')).toBeTruthy();
  expect(screen.getByText('Andheri')).toBeTruthy();
  expect(screen.getByText('Ravi')).toBeTruthy();
});

it('says an enquiry is not yet a client', async () => {
  await mount();
  expect(screen.getByText('not yet a client')).toBeTruthy();
});

it('says so when it is already an existing client', async () => {
  await mount({ client: { code: 'CLI-1', name: 'Verma Interiors' } });
  expect(screen.getByText('CLI-1 · existing client')).toBeTruthy();
});

it('says plainly when there is nobody to ring', async () => {
  await mount({ contactName: null, client: null });
  expect(screen.getByText('No contact yet')).toBeTruthy();
});

it('shows the admin’s own custom fields, by their labels', async () => {
  await mount();
  expect(await screen.findByText('Architect')).toBeTruthy();
  expect(screen.getByText('Rao')).toBeTruthy();
});

it('shows the history of how it got here, and what was edited on the way', async () => {
  mockHistory.mockResolvedValue([
    {
      id: 'h1',
      at: '2026-09-01T10:00:00Z',
      kind: 'moved',
      action: 'lead.moved',
      entity: 'Lead',
      entityId: 'l1',
      from: null,
      to: 'New enquiry',
      reason: 'Lead created',
      by: 'Ravi',
    },
    {
      id: 'h2',
      at: '2026-09-02T10:00:00Z',
      kind: 'changed',
      action: 'lead.updated',
      entity: 'Lead',
      entityId: 'l1',
      by: 'Ravi',
      changes: [{ field: 'estimatedValue', from: 50000, to: 65000 }],
    },
  ]);
  await mount();

  expect(await screen.findByText('Punched at New enquiry')).toBeTruthy();
  expect(screen.getByText(/Lead created/)).toBeTruthy();
  // A status list could never have shown this.
  expect(screen.getByText('Estimated value changed')).toBeTruthy();
});

describe('converting', () => {
  it('offers conversion on a lead that is still open', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Convert to order'));
    expect(navigate).toHaveBeenCalledWith('LeadConvert', { leadId: 'l1' });
  });

  it('shows the order instead once it has been converted', async () => {
    await mount({
      convertedOrder: { id: 'o1', code: 'ORD-9' },
      convertedAt: '2026-09-03T10:00:00Z',
    });
    expect(screen.queryByText('Convert to order')).toBeNull();
    expect(screen.getByText('Converted')).toBeTruthy();
    expect(screen.getByText(/ORD-9 ·/)).toBeTruthy();
  });

  it('opens the order it became', async () => {
    await mount({
      convertedOrder: { id: 'o1', code: 'ORD-9' },
      convertedAt: '2026-09-03T10:00:00Z',
    });
    await fireEvent.press(screen.getByText('Converted'));
    expect(navigate).toHaveBeenCalledWith('OrderDetail', { orderId: 'o1' });
  });
});

describe('quoting the enquiry', () => {
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

  it('is offered to somebody who may write one', async () => {
    mockPermissions = [PERMISSIONS.ESTIMATE_MANAGE];
    await mount();
    expect(screen.getByText('Quote this enquiry')).toBeTruthy();
  });

  it('is not offered to somebody who may not', async () => {
    await mount();
    expect(screen.queryByText('Quote this enquiry')).toBeNull();
  });

  it('is not offered once the enquiry became work', async () => {
    mockPermissions = [PERMISSIONS.ESTIMATE_MANAGE];
    await mount({ convertedOrder: { id: 'o1', code: 'ORD-1' } });
    expect(screen.queryByText('Quote this enquiry')).toBeNull();
  });

  it('opens the quote screen knowing who it is for and what it is about', async () => {
    mockPermissions = [PERMISSIONS.ESTIMATE_MANAGE];
    await mount();
    await fireEvent.press(screen.getByText('Quote this enquiry'));
    // So the same details are not typed a second time.
    expect(navigate).toHaveBeenCalledWith('EstimateEdit', {
      lead: {
        id: 'l1',
        code: 'LEAD-1',
        title: 'Kitchen jali',
        clientId: null,
        clientName: 'Verma',
        location: 'Andheri',
      },
    });
  });

  it('lists what has been quoted, and for how much', async () => {
    await mount({ estimates: QUOTES });
    expect(screen.getByText('EST-2627-0001')).toBeTruthy();
    expect(screen.getByText('₹4.50 L')).toBeTruthy();
    expect(screen.getByText('SENT')).toBeTruthy();
  });

  it('opens a quote that was tapped', async () => {
    await mount({ estimates: QUOTES });
    await fireEvent.press(screen.getByText('EST-2627-0001'));
    expect(navigate).toHaveBeenCalledWith('EstimateDetail', { estimateId: 'e1' });
  });

  it('says nothing about quotes on an enquiry that has none', async () => {
    await mount();
    expect(screen.queryByText('Quotes')).toBeNull();
  });
});

describe('moving it along the pipeline', () => {
  it('offers exactly the moves the admin drew', async () => {
    await mount();
    await waitFor(() => expect(mockAllowedNext).toHaveBeenCalledWith('s1'));
    await fireEvent.press(screen.getByText('Move stage'));
    expect(await screen.findByText('Won')).toBeTruthy();
    expect(screen.getByText('Mark lost')).toBeTruthy();
  });

  it('offers nothing when the pipeline allows nothing from here', async () => {
    mockAllowedNext.mockResolvedValue([]);
    await mount();
    await waitFor(() => expect(mockAllowedNext).toHaveBeenCalled());
    expect(screen.queryByText('Move stage')).toBeNull();
  });

  it('moves straight away when no note is required', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Move stage'));
    await fireEvent.press(await screen.findByText('Won'));
    await waitFor(() =>
      expect(mockChangeStatus).toHaveBeenCalledWith('l1', {
        toStatusId: 's2',
        note: undefined,
      }),
    );
  });

  it('asks why before a move the pipeline requires a note for', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Move stage'));
    await fireEvent.press(await screen.findByText('Mark lost'));
    expect(await screen.findByPlaceholderText('Explain the move')).toBeTruthy();
    expect(mockChangeStatus).not.toHaveBeenCalled();
  });

  it('sends the note with the move', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Move stage'));
    await fireEvent.press(await screen.findByText('Mark lost'));
    await fireEvent.changeText(screen.getByPlaceholderText('Explain the move'), ' went elsewhere ');
    await fireEvent.press(screen.getByText('Confirm'));
    await waitFor(() =>
      expect(mockChangeStatus).toHaveBeenCalledWith('l1', {
        toStatusId: 's9',
        note: 'went elsewhere',
      }),
    );
  });

  it('shows the server’s refusal', async () => {
    mockChangeStatus.mockRejectedValue(
      new Error('The pipeline does not allow moving from Quoted to Won'),
    );
    await mount();
    await fireEvent.press(screen.getByText('Move stage'));
    await fireEvent.press(await screen.findByText('Won'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe('Could not move');
  });
});

describe('sending the enquiry back', () => {
  const BACK = [
    { transitionId: 't0', toStatus: { id: 's0', name: 'Contacted', color: '#2F81F7' } },
  ];

  const allowed = () => {
    mockPermissions = [PERMISSIONS.LEAD_MOVE_BACK];
    mockAllowedBack.mockResolvedValue(BACK);
  };

  it('is not offered to somebody who cannot make it', async () => {
    mockAllowedBack.mockResolvedValue(BACK);
    await mount();
    await fireEvent.press(screen.getByText('Move stage'));
    await screen.findByText('Won');
    expect(mockAllowedBack).not.toHaveBeenCalled();
    expect(screen.queryByText('Back to Contacted')).toBeNull();
  });

  it('offers it apart from the ordinary moves', async () => {
    allowed();
    await mount();
    await waitFor(() => expect(mockAllowedBack).toHaveBeenCalledWith('s1'));
    await fireEvent.press(screen.getByText('Move stage'));
    expect(await screen.findByText('Not the usual journey')).toBeTruthy();
    expect(screen.getByText('Back to Contacted')).toBeTruthy();
  });

  it('asks before it does it, naming both ends', async () => {
    allowed();
    await mount();
    await fireEvent.press(screen.getByText('Move stage'));
    await fireEvent.press(await screen.findByText('Back to Contacted'));
    expect(await screen.findByText(/is not a step/)).toBeTruthy();
    expect(mockChangeStatus).not.toHaveBeenCalled();
  });

  it('leaves it where it is when the question is declined', async () => {
    allowed();
    await mount();
    await fireEvent.press(screen.getByText('Move stage'));
    await fireEvent.press(await screen.findByText('Back to Contacted'));
    await fireEvent.press(await screen.findByText('Leave it where it is'));
    expect(mockChangeStatus).not.toHaveBeenCalled();
  });

  it('says out loud that it is a reversal when it sends it', async () => {
    allowed();
    await mount();
    await fireEvent.press(screen.getByText('Move stage'));
    await fireEvent.press(await screen.findByText('Back to Contacted'));
    await fireEvent.changeText(
      screen.getByPlaceholderText('A note for whoever reads this later'),
      ' talking again ',
    );
    await fireEvent.press(screen.getByText('Yes, move it back'));
    await waitFor(() =>
      expect(mockChangeStatus).toHaveBeenCalledWith('l1', {
        toStatusId: 's0',
        note: 'talking again',
        reverse: true,
      }),
    );
  });

  it('marks a reversal in the history', async () => {
    allowed();
    mockHistory.mockResolvedValue([
      {
        id: 'h9',
        at: '2026-09-02T10:00:00Z',
        kind: 'moved',
        action: 'lead.moved_back',
        entity: 'Lead',
        entityId: 'l1',
        from: 'Quoted',
        to: 'Contacted',
        reversed: true,
        reason: 'Talking again',
        by: 'Nakul',
      },
    ]);
    await mount();
    expect(await screen.findByText(/went back/)).toBeTruthy();
  });
});

it('keeps the heading in view while the enquiry scrolls under it', async () => {
  await mount();
  // An enquiry with its quotes and its history under it is long enough that
  // the way back was a scroll away.
  expect(screen.getByTestId('sticky-bar')).toBeTruthy();
  expect(screen.getByTestId('screen-scroll').props.stickyHeaderIndices).toEqual([0]);
});
