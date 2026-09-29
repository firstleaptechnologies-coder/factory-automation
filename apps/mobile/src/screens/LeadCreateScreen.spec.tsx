import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { LeadCreateScreen } from './LeadCreateScreen';

const mockLeadSources = jest.fn();
const mockLeadFields = jest.fn();
const mockCreateLead = jest.fn();
const mockGstSlabs = jest.fn();
jest.mock('../api/client', () => ({
  api: {
    leadSources: () => mockLeadSources(),
    leadFields: () => mockLeadFields(),
    gstSlabs: () => mockGstSlabs(),
    createLead: (...a: unknown[]) => mockCreateLead(...a),
  },
}));

const replace = jest.fn();
const goBack = jest.fn();

async function mount() {
  await render(<LeadCreateScreen navigation={{ replace, goBack }} />);
  await screen.findByText('New lead');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLeadSources.mockResolvedValue([{ id: 'src1', name: 'Referral', color: '#2EA043' }]);
  mockLeadFields.mockResolvedValue([
    { id: 'f1', key: 'architect', label: 'Architect', type: 'TEXT', options: [], required: false },
  ]);
  mockCreateLead.mockResolvedValue({ id: 'l1' });
  mockGstSlabs.mockResolvedValue([
    { id: 'gst18', name: 'GST 18%', ratePct: '18', isDefault: true, isActive: true },
  ]);
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
  await fireEvent.press(screen.getByText('Create lead'));
  expect(mockCreateLead).not.toHaveBeenCalled();
});

it('creates the enquiry with what was filled in', async () => {
  await mount();
  await fireEvent.changeText(
    screen.getByPlaceholderText('e.g. Marble kitchen counters'),
    ' Kitchen jali ',
  );
  await fireEvent.press(screen.getByText('Create lead'));
  await waitFor(() => expect(mockCreateLead).toHaveBeenCalled());
  expect(mockCreateLead.mock.calls[0][0]).toMatchObject({ title: 'Kitchen jali' });
});

it('sends nothing rather than empty strings for the fields left blank', async () => {
  await mount();
  await fireEvent.changeText(
    screen.getByPlaceholderText('e.g. Marble kitchen counters'),
    'Kitchen jali',
  );
  await fireEvent.press(screen.getByText('Create lead'));
  await waitFor(() => expect(mockCreateLead).toHaveBeenCalled());
  const body = mockCreateLead.mock.calls[0][0];
  expect(body.contactName).toBeUndefined();
  expect(body.company).toBeUndefined();
  expect(body.estimatedValue).toBeUndefined();
});

it('opens the lead it created, replacing this form', async () => {
  await mount();
  await fireEvent.changeText(
    screen.getByPlaceholderText('e.g. Marble kitchen counters'),
    'Kitchen jali',
  );
  await fireEvent.press(screen.getByText('Create lead'));
  // Replaced, not pushed: going back to a half-filled form is a dead end.
  await waitFor(() => expect(replace).toHaveBeenCalledWith('LeadDetail', { leadId: 'l1' }));
});

it('shows the server’s refusal and keeps what was typed', async () => {
  mockCreateLead.mockRejectedValue(
    new Error('A lead needs either an existing client or a contact name or phone'),
  );
  await mount();
  await fireEvent.changeText(
    screen.getByPlaceholderText('e.g. Marble kitchen counters'),
    'Kitchen jali',
  );
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
  await fireEvent.changeText(
    screen.getByPlaceholderText('e.g. Marble kitchen counters'),
    'Kitchen jali',
  );
  await fireEvent.press(screen.getByText('Create lead'));
  await waitFor(() => expect(mockCreateLead).toHaveBeenCalled());
  expect(mockCreateLead.mock.calls[0][0].sourceId).toBeUndefined();
});

describe('pricing it, the way a quote is priced', () => {
  /** Opens the line editor and fills the first line. */
  async function priceOne(qty = '10', rate = '1000') {
    await fireEvent.press(screen.getByTestId('start-pricing'));
    await fireEvent.changeText(
      screen.getByPlaceholderText('Hdmr cutting 22mm'),
      'Hdmr 22mm',
    );
    await fireEvent.changeText(screen.getByLabelText('Qty'), qty);
    await fireEvent.changeText(screen.getByLabelText('Rate'), rate);
  }

  it('stays closed until somebody asks for it, because most enquiries have no price', async () => {
    await mount();
    expect(screen.getByTestId('start-pricing')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Hdmr cutting 22mm')).toBeNull();
  });

  it('takes a line the same way the quote form does', async () => {
    await mount();
    await priceOne();
    // Name, qty, rate, discount, unit, GST slab and HSN — the quote's fields.
    expect(screen.getByLabelText('Disc %')).toBeTruthy();
    expect(screen.getByTestId('unit-0')).toBeTruthy();
    expect(screen.getByTestId('slab-0')).toBeTruthy();
    expect(screen.getByText('+ HSN/SAC')).toBeTruthy();
  });

  it('defaults the unit to square feet, which is what the shop cuts in', async () => {
    await mount();
    await fireEvent.press(screen.getByTestId('start-pricing'));
    expect(screen.getByText('Sqf')).toBeTruthy();
  });

  it('offers the shop’s own GST slabs on the line', async () => {
    await mount();
    await priceOne();
    // The chip already shows the default slab, so the sheet's row is a
    // second copy of the same words rather than the only one.
    expect(screen.getAllByText('GST 18%')).toHaveLength(1);
    await fireEvent.press(screen.getByTestId('slab-0'));
    await waitFor(() => expect(screen.getAllByText('GST 18%')).toHaveLength(2));
  });

  it('sends the lines, and says how GST was quoted', async () => {
    await mount();
    await fireEvent.changeText(
      screen.getByPlaceholderText('e.g. Marble kitchen counters'),
      'Kitchen',
    );
    await fireEvent.changeText(screen.getByLabelText('Phone'), '9820012345');
    await priceOne();
    await fireEvent.press(screen.getByText('Create lead'));

    await waitFor(() => expect(mockCreateLead).toHaveBeenCalled());
    const body = mockCreateLead.mock.calls[0][0];
    expect(body.taxTreatment).toBe('EXCLUSIVE');
    expect(body.items).toEqual([
      {
        name: 'Hdmr 22mm',
        quantity: 10,
        unit: 'Sqf',
        ratePerUnit: 1000,
        gstSlabId: 'gst18',
      },
    ]);
  });

  it('sends no items at all when nothing was priced — that is not a cleared set', async () => {
    await mount();
    await fireEvent.changeText(
      screen.getByPlaceholderText('e.g. Marble kitchen counters'),
      'Kitchen',
    );
    await fireEvent.press(screen.getByText('Create lead'));
    await waitFor(() => expect(mockCreateLead).toHaveBeenCalled());
    const body = mockCreateLead.mock.calls[0][0];
    expect(body).not.toHaveProperty('items');
    expect(body).not.toHaveProperty('taxTreatment');
  });

  it('drops a line nobody finished, rather than sending a nameless zero', async () => {
    await mount();
    await fireEvent.changeText(
      screen.getByPlaceholderText('e.g. Marble kitchen counters'),
      'Kitchen',
    );
    await priceOne();
    await fireEvent.press(screen.getByTestId('add-line'));
    await fireEvent.press(screen.getByText('Create lead'));
    await waitFor(() => expect(mockCreateLead).toHaveBeenCalled());
    expect(mockCreateLead.mock.calls[0][0].items).toHaveLength(1);
  });

  it('previews what it comes to, and says the server has the last word', async () => {
    await mount();
    await priceOne();
    expect(await screen.findByText('₹11,800')).toBeTruthy();
    expect(screen.getByText('₹1,800')).toBeTruthy();
    expect(screen.getByText('The server prices it for real when you save.')).toBeTruthy();
  });

  it('reads the same lines the other way round when GST is included', async () => {
    await mount();
    await priceOne();
    await fireEvent.press(screen.getByText('GST included'));
    // 10,000 is now what they pay, so what they pay does not move.
    await waitFor(() => expect(screen.getAllByText('₹10,000').length).toBeGreaterThan(0));
  });
});
