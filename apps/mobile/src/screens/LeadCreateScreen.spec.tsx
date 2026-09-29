import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { LeadCreateScreen } from './LeadCreateScreen';

const mockLeadSources = jest.fn();
const mockLeadFields = jest.fn();
const mockCreateLead = jest.fn();
jest.mock('../api/client', () => ({
  api: {
    leadSources: () => mockLeadSources(),
    leadFields: () => mockLeadFields(),
    createLead: (...a: unknown[]) => mockCreateLead(...a),
  },
}));

const replace = jest.fn();
const goBack = jest.fn();

async function mount() {
  await render(<LeadCreateScreen navigation={{ replace, goBack }} />);
  await screen.findByText('New lead');
}

/** The three the form will not save without: what, who, and a number. */
async function fill(title = 'Kitchen jali') {
  await fireEvent.changeText(
    screen.getByPlaceholderText('e.g. Marble kitchen counters'),
    title,
  );
  await fireEvent.changeText(screen.getByPlaceholderText('Who rang?'), 'Verma');
  await fireEvent.changeText(
    screen.getByPlaceholderText('The number to ring back on'),
    '9820012345',
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLeadSources.mockResolvedValue([{ id: 'src1', name: 'Referral', color: '#2EA043' }]);
  mockLeadFields.mockResolvedValue([
    { id: 'f1', key: 'architect', label: 'Architect', type: 'TEXT', options: [], required: false },
  ]);
  mockCreateLead.mockResolvedValue({ id: 'l1' });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

it('asks what the enquiry is for', async () => {
  await mount();
  expect(screen.getByPlaceholderText('e.g. Marble kitchen counters')).toBeTruthy();
});

it('offers the admin’s own lead sources', async () => {
  await mount();
  expect(await screen.findByText('Referral')).toBeTruthy();
});

it('offers the admin’s own custom fields', async () => {
  await mount();
  expect(await screen.findByText('Architect')).toBeTruthy();
});

it('cannot be created without a title', async () => {
  await mount();
  await fireEvent.changeText(screen.getByPlaceholderText('Who rang?'), 'Verma');
  await fireEvent.changeText(
    screen.getByPlaceholderText('The number to ring back on'),
    '9820012345',
  );
  await fireEvent.press(screen.getByText('Create lead'));
  expect(mockCreateLead).not.toHaveBeenCalled();
});

it('creates the enquiry with what was filled in', async () => {
  await mount();
  await fill(' Kitchen jali ');
  await fireEvent.press(screen.getByText('Create lead'));
  await waitFor(() => expect(mockCreateLead).toHaveBeenCalled());
  expect(mockCreateLead.mock.calls[0][0]).toMatchObject({
    title: 'Kitchen jali',
    contactName: 'Verma',
    contactPhone: '9820012345',
  });
});

it('sends nothing rather than empty strings for the fields left blank', async () => {
  await mount();
  await fill();
  await fireEvent.press(screen.getByText('Create lead'));
  await waitFor(() => expect(mockCreateLead).toHaveBeenCalled());
  const body = mockCreateLead.mock.calls[0][0];
  expect(body.company).toBeUndefined();
  expect(body.billingAddress).toBeUndefined();
});

it('does not ask for an estimate — that is what the quote is for', async () => {
  await mount();
  expect(screen.queryByText('Estimated value (₹)')).toBeNull();
});

it('opens the lead it created, replacing this form', async () => {
  await mount();
  await fill();
  await fireEvent.press(screen.getByText('Create lead'));
  // Replaced, not pushed: going back to a half-filled form is a dead end.
  await waitFor(() => expect(replace).toHaveBeenCalledWith('LeadDetail', { leadId: 'l1' }));
});

it('shows the server’s refusal and keeps what was typed', async () => {
  mockCreateLead.mockRejectedValue(new Error('Source is not active'));
  await mount();
  await fill();
  await fireEvent.press(screen.getByText('Create lead'));
  await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
  expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe('Could not create');
  expect(replace).not.toHaveBeenCalled();
});

it('picks a source, and can unpick it', async () => {
  await mount();
  await fireEvent.press(await screen.findByText('Referral'));
  // Re-queried: the chip re-renders with a new handler once it is selected.
  await fireEvent.press(screen.getByText('Referral'));
  await fill();
  await fireEvent.press(screen.getByText('Create lead'));
  await waitFor(() => expect(mockCreateLead).toHaveBeenCalled());
  expect(mockCreateLead.mock.calls[0][0].sourceId).toBeUndefined();
});

describe('the items on it', () => {
  /** Opens the item editor and fills the first line. */
  async function addItem(name = 'MDF jali 18mm') {
    await fireEvent.press(screen.getByTestId('start-items'));
    await fireEvent.changeText(screen.getByPlaceholderText('MDF jali, laser cut'), name);
  }

  it('stays closed until asked for — plenty of enquiries are one line on a call', async () => {
    await mount();
    expect(screen.getByTestId('start-items')).toBeTruthy();
    expect(screen.queryByPlaceholderText('MDF jali, laser cut')).toBeNull();
  });

  it('asks nothing about GST — an enquiry is not a tax document', async () => {
    await mount();
    await addItem();
    expect(screen.queryByText('GST on top')).toBeNull();
    expect(screen.queryByText('GST included')).toBeNull();
    expect(screen.queryByTestId('slab-0')).toBeNull();
    expect(screen.queryByText('+ HSN/SAC')).toBeNull();
  });

  it('takes a description under the name of the item', async () => {
    await mount();
    await addItem();
    expect(screen.getByPlaceholderText('Detail — finish, edge, size')).toBeTruthy();
  });

  it('keeps quantity, rate and discount, all optional', async () => {
    await mount();
    await addItem();
    expect(screen.getByLabelText('Qty')).toBeTruthy();
    expect(screen.getByLabelText('Rate')).toBeTruthy();
    expect(screen.getByLabelText('Disc %')).toBeTruthy();
    // And the unit, because 120 of something is meaningless on a decor floor.
    expect(screen.getByText('Sqf')).toBeTruthy();
  });

  it('sends an item that is only a name, because most of them are', async () => {
    await mount();
    await fill();
    await addItem();
    await fireEvent.press(screen.getByText('Create lead'));

    await waitFor(() => expect(mockCreateLead).toHaveBeenCalled());
    const body = mockCreateLead.mock.calls[0][0];
    expect(body.items).toEqual([{ name: 'MDF jali 18mm', unit: 'Sqf' }]);
    expect(body).not.toHaveProperty('taxTreatment');
  });

  it('sends the rate where somebody knew one', async () => {
    await mount();
    await fill();
    await addItem();
    await fireEvent.changeText(
      screen.getByPlaceholderText('Detail — finish, edge, size'),
      'Natural finish',
    );
    await fireEvent.changeText(screen.getByLabelText('Qty'), '120');
    await fireEvent.changeText(screen.getByLabelText('Rate'), '450');
    await fireEvent.press(screen.getByText('Create lead'));

    await waitFor(() => expect(mockCreateLead).toHaveBeenCalled());
    expect(mockCreateLead.mock.calls[0][0].items).toEqual([
      {
        name: 'MDF jali 18mm',
        description: 'Natural finish',
        unit: 'Sqf',
        quantity: 120,
        ratePerUnit: 450,
      },
    ]);
  });

  it('sends no items at all when nothing was listed — that is not a cleared set', async () => {
    await mount();
    await fill();
    await fireEvent.press(screen.getByText('Create lead'));
    await waitFor(() => expect(mockCreateLead).toHaveBeenCalled());
    expect(mockCreateLead.mock.calls[0][0]).not.toHaveProperty('items');
  });

  it('totals what was priced, without a tax line', async () => {
    await mount();
    await addItem();
    await fireEvent.changeText(screen.getByLabelText('Qty'), '120');
    await fireEvent.changeText(screen.getByLabelText('Rate'), '450');
    // Three times: under the line, as the subtotal, and as the total — with
    // no tax there is nothing between the last two to tell them apart.
    await waitFor(() => expect(screen.getAllByText('₹54,000')).toHaveLength(3));
    expect(screen.getByText('Subtotal')).toBeTruthy();
    expect(screen.queryByText('GST')).toBeNull();
    expect(screen.queryByText('Taxable')).toBeNull();
  });
});

describe('who the enquiry is for', () => {
  it('will not create one without a name and a number', async () => {
    await mount();
    await fireEvent.changeText(
      screen.getByPlaceholderText('e.g. Marble kitchen counters'),
      'Kitchen',
    );
    expect(screen.getByText('Create lead')).toBeDisabled();

    await fireEvent.changeText(screen.getByPlaceholderText('Who rang?'), 'Verma');
    // A name on its own is still nobody you can ring back.
    expect(screen.getByText('Create lead')).toBeDisabled();

    await fireEvent.changeText(
      screen.getByPlaceholderText('The number to ring back on'),
      '9820012345',
    );
    expect(screen.getByText('Create lead')).not.toBeDisabled();
  });

  it('takes the addresses, both optional', async () => {
    await mount();
    await fill();
    await fireEvent.changeText(screen.getByLabelText('Billing address'), 'Unit 4, Andheri');
    await fireEvent.press(screen.getByText('Create lead'));
    await waitFor(() => expect(mockCreateLead).toHaveBeenCalled());
    const body = mockCreateLead.mock.calls[0][0];
    expect(body.billingAddress).toBe('Unit 4, Andheri');
    // Empty means the same as billing, so nothing is sent for it.
    expect(body.shippingAddress).toBeUndefined();
  });
});
