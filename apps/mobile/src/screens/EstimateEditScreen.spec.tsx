import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { EstimateEditScreen } from './EstimateEditScreen';

const mockEstimate = jest.fn();
const mockGstSlabs = jest.fn();
const mockSearchClients = jest.fn();
const mockCreateEstimate = jest.fn();
const mockUpdateEstimate = jest.fn();
jest.mock('../api/client', () => ({
  api: {
    estimate: (...a: unknown[]) => mockEstimate(...a),
    gstSlabs: (...a: unknown[]) => mockGstSlabs(...a),
    searchClients: (...a: unknown[]) => mockSearchClients(...a),
    createEstimate: (...a: unknown[]) => mockCreateEstimate(...a),
    updateEstimate: (...a: unknown[]) => mockUpdateEstimate(...a),
  },
}));

const SLAB_18 = { id: 'g18', name: 'GST 18%', ratePct: '18', isDefault: true };
const SLAB_5 = { id: 'g5', name: 'GST 5%', ratePct: '5', isDefault: false };

const CLIENT = {
  id: 'c1',
  code: 'CL-1',
  name: 'Verma Interiors',
  phone: '9829012345',
  billingAddress: 'Bhilwara',
  shippingAddress: 'Site 4, Udaipur',
  address: null,
};

const ESTIMATE = {
  id: 'e1',
  code: 'EST-1',
  clientId: 'c1',
  client: CLIENT,
  clientName: null,
  billingAddress: 'Bhilwara',
  shippingAddress: null,
  taxTreatment: 'INCLUSIVE',
  notes: 'Valid for 15 days',
  items: [
    {
      id: 'i1',
      name: 'Jali cutting',
      hsnSac: '4412',
      quantity: '10',
      unit: 'Sqf',
      ratePerUnit: '500',
      discountPct: '0',
      gstSlabId: 'g18',
    },
  ],
};

const navigation = { goBack: jest.fn(), replace: jest.fn() };

async function mount(params: unknown = {}) {
  await render(<EstimateEditScreen route={{ params }} navigation={navigation} />);
  await screen.findByText('Who is it for?');
}

const fill = async (name: string, qty: string, rate: string, discount?: string) => {
  await fireEvent.changeText(screen.getByPlaceholderText('Hdmr cutting 22mm'), name);
  await fireEvent.changeText(screen.getAllByLabelText('Qty')[0], qty);
  await fireEvent.changeText(screen.getAllByLabelText('Rate')[0], rate);
  if (discount) await fireEvent.changeText(screen.getAllByLabelText('Disc %')[0], discount);
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGstSlabs.mockResolvedValue([SLAB_18, SLAB_5]);
  mockSearchClients.mockResolvedValue([CLIENT]);
  mockEstimate.mockResolvedValue(ESTIMATE);
  mockCreateEstimate.mockResolvedValue({ id: 'e9' });
  mockUpdateEstimate.mockResolvedValue({ id: 'e1' });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

it('opens empty for a new estimate, with one line ready', async () => {
  await mount();
  expect(screen.getByText('New quote')).toBeTruthy();
  expect(screen.getByText('LINE 1')).toBeTruthy();
  expect(mockEstimate).not.toHaveBeenCalled();
});

it('waits for an existing estimate rather than showing an empty form first', async () => {
  mockEstimate.mockReturnValue(new Promise(() => {}));
  await render(<EstimateEditScreen route={{ params: { estimateId: 'e1' } }} navigation={navigation} />);
  expect(screen.getByText('Loading')).toBeTruthy();
});

it('fills the form from the estimate being edited', async () => {
  await mount({ estimateId: 'e1' });
  expect(screen.getByText('Edit quote')).toBeTruthy();
  expect(screen.getByText('EST-1')).toBeTruthy();
  expect(screen.getByText('Verma Interiors')).toBeTruthy();
  expect(screen.getByDisplayValue('Jali cutting')).toBeTruthy();
  expect(screen.getByDisplayValue('Valid for 15 days')).toBeTruthy();
});

it('survives an estimate whose optional fields are all empty', async () => {
  mockEstimate.mockResolvedValue({
    ...ESTIMATE,
    client: null,
    clientName: 'Walk-in',
    billingAddress: null,
    notes: null,
    items: [{ ...ESTIMATE.items[0], hsnSac: null, discountPct: '0', gstSlabId: null }],
  });
  await mount({ estimateId: 'e1' });
  expect(screen.getByDisplayValue('Walk-in')).toBeTruthy();
});

describe('the money preview', () => {
  it('adds GST on top of what was quoted', async () => {
    await mount();
    await fill('Jali', '10', '100');
    // 1,000 quoted, 18% on top, so the client pays 1,180. Twice for the
    // 1,000: the line's own total and the taxable figure below.
    expect(screen.getAllByText('₹1,000')).toHaveLength(2);
    expect(screen.getByText('₹180')).toBeTruthy();
    expect(screen.getByText('₹1,180')).toBeTruthy();
  });

  it('takes GST out of the figure when it is quoted inclusive', async () => {
    await mount();
    await fireEvent.press(screen.getByText('GST included'));
    await fill('Jali', '10', '118');
    // 1,180 is what they pay; 1,000 of it is the work and 180 the tax.
    expect(screen.getByText('₹1,000')).toBeTruthy();
    expect(screen.getByText('₹180')).toBeTruthy();
    expect(screen.getAllByText('₹1,180').length).toBeGreaterThan(0);
  });

  it('treats an absorbed quote like an inclusive one — the client pays the figure', async () => {
    await mount();
    await fireEvent.press(screen.getByText('GST absorbed'));
    await fill('Jali', '10', '118');
    // The shop carries the tax out of what it quoted; the client still pays
    // exactly the quoted figure, so nothing is added on top.
    expect(screen.getAllByText('₹1,180').length).toBeGreaterThan(0);
    expect(screen.getByText('₹1,000')).toBeTruthy();
  });

  it('says what each treatment means, since the difference is the whole point', async () => {
    await mount();
    expect(screen.getByText(/The client pays your figure plus GST/)).toBeTruthy();
    await fireEvent.press(screen.getByText('GST absorbed'));
    expect(screen.getByText(/cannot take a GST bill/)).toBeTruthy();
  });

  it('takes the discount off before the tax', async () => {
    await mount();
    await fill('Jali', '10', '100', '10');
    // 1,000 less 100 is 900, and 18% of 900 is 162.
    expect(screen.getByText('₹900')).toBeTruthy();
    expect(screen.getByText('₹162')).toBeTruthy();
    expect(screen.getByText('₹1,062')).toBeTruthy();
  });

  it('shows the discount only when there is one', async () => {
    await mount();
    await fill('Jali', '10', '100');
    expect(screen.queryByText('Discount')).toBeNull();
    await fireEvent.changeText(screen.getAllByLabelText('Disc %')[0], '10');
    expect(screen.getByText('Discount')).toBeTruthy();
  });

  it('prices a line at whatever slab it was given, not the default', async () => {
    await mount();
    await fill('Jali', '10', '100');
    await fireEvent.press(screen.getByText('GST 18%'));
    await fireEvent.press(await screen.findByText('GST 5%'));
    // 5% of 1,000 is 50.
    await waitFor(() => expect(screen.getByText('₹50')).toBeTruthy());
    expect(screen.getByText('₹1,050')).toBeTruthy();
  });

  it('adds the lines up', async () => {
    await mount();
    await fill('Jali', '10', '100');
    await fireEvent.press(screen.getByText('Add a line'));
    const names = screen.getAllByPlaceholderText('Hdmr cutting 22mm');
    await fireEvent.changeText(names[1], 'Polishing');
    await fireEvent.changeText(screen.getAllByLabelText('Qty')[1], '2');
    await fireEvent.changeText(screen.getAllByLabelText('Rate')[1], '250');
    expect(screen.getByText('₹1,500')).toBeTruthy();
  });

  it('says the server prices it for real, so the figure is not mistaken for final', async () => {
    await mount();
    expect(screen.getByText('The server prices it for real when you save.')).toBeTruthy();
  });

  it('reads nothing typed as nothing rather than as NaN', async () => {
    await mount();
    await fill('Jali', 'abc', '100');
    expect(screen.getAllByText('₹0').length).toBeGreaterThan(0);
  });
});

describe('the lines', () => {
  it('shows what a line comes to, and what the discount takes off', async () => {
    await mount();
    await fill('Jali', '10', '100', '10');
    expect(screen.getByText('₹1,000 less ₹100 discount')).toBeTruthy();
  });

  it('adds and removes lines', async () => {
    await mount();
    expect(screen.queryByText('Remove')).toBeNull();
    await fireEvent.press(screen.getByText('Add a line'));
    expect(screen.getByText('LINE 2')).toBeTruthy();
    await fireEvent.press(screen.getAllByText('Remove')[1]);
    expect(screen.queryByText('LINE 2')).toBeNull();
  });

  it('will not let the last line be removed, since a quote needs one', async () => {
    await mount();
    expect(screen.queryByText('Remove')).toBeNull();
  });

  it('picks a unit for a line', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Sqf'));
    await fireEvent.press(await screen.findByText('Rft'));
    await waitFor(() => expect(screen.getByText('Rft')).toBeTruthy());
  });
});

/*
 * The same control the punch screen uses, so a quote and the order that comes
 * out of it land on one client rather than two records with the same phone
 * number. It used to be a plain name field beside a search-only sheet, which
 * could not add anybody at all.
 */
describe('who the estimate is for', () => {
  const search = async (term: string) => {
    await fireEvent.press(screen.getByLabelText('Search existing clients'));
    await fireEvent.changeText(await screen.findByPlaceholderText('Type to search…'), term);
  };

  it('picks a client and takes their addresses with them', async () => {
    await mount();
    await search('verma');
    await fireEvent.press(await screen.findByText('Verma Interiors'));
    expect(screen.getByDisplayValue('Bhilwara')).toBeTruthy();
    expect(screen.getByDisplayValue('Site 4, Udaipur')).toBeTruthy();
  });

  it('sends the id of a client who is already on file', async () => {
    await mount();
    await search('verma');
    await fireEvent.press(await screen.findByText('Verma Interiors'));
    await fill('Jali', '1', '100');
    await fireEvent.press(screen.getByText('Create quote'));
    await waitFor(() => expect(mockCreateEstimate).toHaveBeenCalled());
    expect(mockCreateEstimate.mock.calls[0][0]).toMatchObject({ clientId: 'c1' });
    expect(mockCreateEstimate.mock.calls[0][0].newClient).toBeUndefined();
  });

  it('adds somebody who is not on file yet, without leaving the quote', async () => {
    await mount();
    await fireEvent.changeText(
      screen.getByPlaceholderText('Who is this quote for?'),
      'Passing trade',
    );
    await fireEvent.changeText(
      screen.getByPlaceholderText('Optional — matches an existing client'),
      '9820012345',
    );
    await fill('Panel', '1', '900');
    await fireEvent.press(screen.getByText('Create quote'));
    await waitFor(() => expect(mockCreateEstimate).toHaveBeenCalled());
    expect(mockCreateEstimate.mock.calls[0][0]).toMatchObject({
      newClient: { name: 'Passing trade', phone: '9820012345' },
    });
    expect(mockCreateEstimate.mock.calls[0][0].clientId).toBeUndefined();
  });

  it('lets the chosen client be cleared and somebody else typed in', async () => {
    await mount();
    await search('verma');
    await fireEvent.press(await screen.findByText('Verma Interiors'));
    await fireEvent.press(screen.getByLabelText('Clear the client'));
    // Back to the two ways of filling it in, with nothing carried over.
    expect(screen.getByPlaceholderText('Who is this quote for?').props.value).toBe('');
    expect(screen.getByLabelText('Search existing clients')).toBeTruthy();
  });

  it('searches by name, phone or code rather than filtering a page of clients', async () => {
    await mount();
    await search('verma');
    await waitFor(() => expect(mockSearchClients).toHaveBeenCalledWith('verma'));
  });

  it('offers a name from the phone book as a new client, not as a record', async () => {
    await mount();
    expect(screen.getByText('From contacts')).toBeTruthy();
  });
});

describe('saving', () => {
  it('cannot be saved with no name and no client', async () => {
    await mount();
    await fireEvent.changeText(screen.getAllByLabelText('Qty')[0], '1');
    await fireEvent.press(screen.getByText('Create quote'));
    expect(mockCreateEstimate).not.toHaveBeenCalled();
  });

  it('cannot be saved with nothing on it', async () => {
    await mount();
    await fireEvent.changeText(screen.getByPlaceholderText('Who is this quote for?'), 'Verma');
    await fireEvent.press(screen.getByText('Create quote'));
    expect(mockCreateEstimate).not.toHaveBeenCalled();
  });

  it('leaves out a line that was started and never filled in', async () => {
    await mount();
    await fireEvent.changeText(screen.getByPlaceholderText('Who is this quote for?'), 'Verma');
    await fill('Jali', '10', '100');
    await fireEvent.press(screen.getByText('Add a line'));
    await fireEvent.changeText(screen.getAllByPlaceholderText('Hdmr cutting 22mm')[1], 'Half typed');
    await fireEvent.press(screen.getByText('Create quote'));
    await waitFor(() => expect(mockCreateEstimate).toHaveBeenCalled());
    expect(mockCreateEstimate.mock.calls[0][0].items).toHaveLength(1);
  });

  it('sends each line with the default slab when none was chosen', async () => {
    await mount();
    await fireEvent.changeText(screen.getByPlaceholderText('Who is this quote for?'), 'Verma');
    await fill('  Jali cutting  ', '10', '100');
    await fireEvent.press(screen.getByText('Create quote'));
    await waitFor(() => expect(mockCreateEstimate).toHaveBeenCalled());
    expect(mockCreateEstimate.mock.calls[0][0].items[0]).toMatchObject({
      name: 'Jali cutting',
      quantity: 10,
      ratePerUnit: 100,
      gstSlabId: 'g18',
    });
  });

  it('sends the treatment the quote was written under', async () => {
    await mount();
    await fireEvent.changeText(screen.getByPlaceholderText('Who is this quote for?'), 'Verma');
    await fireEvent.press(screen.getByText('GST absorbed'));
    await fill('Jali', '1', '100');
    await fireEvent.press(screen.getByText('Create quote'));
    await waitFor(() => expect(mockCreateEstimate).toHaveBeenCalled());
    expect(mockCreateEstimate.mock.calls[0][0].taxTreatment).toBe('ABSORBED');
  });

  it('leaves empty text out of the body rather than sending blanks', async () => {
    await mount();
    await fireEvent.changeText(screen.getByPlaceholderText('Who is this quote for?'), 'Verma');
    await fill('Jali', '1', '100');
    await fireEvent.press(screen.getByText('Create quote'));
    await waitFor(() => expect(mockCreateEstimate).toHaveBeenCalled());
    const body = mockCreateEstimate.mock.calls[0][0];
    expect(body.billingAddress).toBeUndefined();
    expect(body.notes).toBeUndefined();
  });

  it('updates instead of creating when an estimate is being edited', async () => {
    await mount({ estimateId: 'e1' });
    await fireEvent.press(screen.getByText('Save quote'));
    await waitFor(() => expect(mockUpdateEstimate).toHaveBeenCalled());
    expect(mockUpdateEstimate.mock.calls[0][0]).toBe('e1');
    expect(mockCreateEstimate).not.toHaveBeenCalled();
  });

  it('opens what was saved, replacing the form so Back does not reopen it', async () => {
    await mount();
    await fireEvent.changeText(screen.getByPlaceholderText('Who is this quote for?'), 'Verma');
    await fill('Jali', '1', '100');
    await fireEvent.press(screen.getByText('Create quote'));
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith('EstimateDetail', { estimateId: 'e9' }),
    );
  });

  it('keeps the form on screen when the server refuses it', async () => {
    mockCreateEstimate.mockRejectedValue(new Error('Client is required'));
    await mount();
    await fireEvent.changeText(screen.getByPlaceholderText('Who is this quote for?'), 'Verma');
    await fill('Jali', '1', '100');
    await fireEvent.press(screen.getByText('Create quote'));
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Could not save', 'Client is required'),
    );
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('Jali')).toBeTruthy();
  });
});

it('goes back', async () => {
  await mount();
  await fireEvent.press(screen.getByLabelText('Back'));
  expect(navigation.goBack).toHaveBeenCalled();
});

describe('quoting an enquiry', () => {
  const LEAD = {
    id: 'ld1',
    code: 'LEAD-1',
    title: 'Kitchen jali',
    clientId: null,
    clientName: 'Verma',
    location: 'Andheri',
  };

  it('opens already knowing who it is for and what it is about', async () => {
    await mount({ lead: LEAD });
    // Typed once on the enquiry; not typed again here.
    expect(screen.getByDisplayValue('Verma')).toBeTruthy();
    expect(screen.getByDisplayValue('Kitchen jali')).toBeTruthy();
    expect(screen.getByDisplayValue('Andheri')).toBeTruthy();
  });

  it('says on the quote which enquiry it is for', async () => {
    await mount({ lead: LEAD });
    expect(screen.getByDisplayValue('For enquiry LEAD-1')).toBeTruthy();
  });

  it('sends the enquiry with the quote, so the two are linked', async () => {
    await mount({ lead: LEAD });
    await fill('Kitchen jali', '10', '500');
    await fireEvent.press(screen.getByText('Create quote'));
    await waitFor(() => expect(mockCreateEstimate).toHaveBeenCalled());
    expect(mockCreateEstimate.mock.calls[0][0].leadId).toBe('ld1');
  });

  it('leaves a walk-in quote unattached to any enquiry', async () => {
    await mount();
    await fireEvent.changeText(
      screen.getByPlaceholderText('Who is this quote for?'),
      'Passing trade',
    );
    await fill('Panel', '1', '900');
    await fireEvent.press(screen.getByText('Create quote'));
    await waitFor(() => expect(mockCreateEstimate).toHaveBeenCalled());
    expect(mockCreateEstimate.mock.calls[0][0].leadId).toBeUndefined();
  });
});
