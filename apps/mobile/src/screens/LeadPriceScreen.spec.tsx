import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { LeadPriceScreen } from './LeadPriceScreen';

const mockLead = jest.fn();
const mockGstSlabs = jest.fn();
const mockUpdateLead = jest.fn();
jest.mock('../api/client', () => ({
  api: {
    lead: (...a: unknown[]) => mockLead(...a),
    gstSlabs: () => mockGstSlabs(),
    updateLead: (...a: unknown[]) => mockUpdateLead(...a),
  },
}));

const ITEM = {
  id: 'li1',
  lineNo: 1,
  name: 'Hdmr 22mm',
  description: null,
  hsnSac: '4411',
  quantity: '10',
  unit: 'Sqf',
  ratePerUnit: '1000',
  discountPct: '0',
  discountAmount: '0',
  gstSlabId: 'gst18',
  gstRatePct: '18',
  taxAmount: '1800',
  netAmount: '10000',
  amount: '11800',
};

const goBack = jest.fn();

async function mount(over: Record<string, unknown> = {}) {
  mockLead.mockResolvedValue({
    id: 'l1',
    code: 'LEAD-1',
    taxTreatment: 'EXCLUSIVE',
    items: [],
    ...over,
  });
  await render(
    <LeadPriceScreen route={{ params: { leadId: 'l1' } }} navigation={{ goBack }} />,
  );
  await screen.findByText('Price this enquiry');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGstSlabs.mockResolvedValue([
    { id: 'gst18', name: 'GST 18%', ratePct: '18', isDefault: true, isActive: true },
  ]);
  mockUpdateLead.mockResolvedValue({});
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

it('opens on what the enquiry is already priced at', async () => {
  await mount({ items: [ITEM] });
  await waitFor(() =>
    expect(screen.getByDisplayValue('Hdmr 22mm')).toBeTruthy(),
  );
  expect(screen.getByDisplayValue('10')).toBeTruthy();
  expect(screen.getByDisplayValue('1000')).toBeTruthy();
});

it('opens on one blank line for an enquiry nobody has priced', async () => {
  await mount();
  await waitFor(() =>
    expect(screen.getByPlaceholderText('Hdmr cutting 22mm')).toBeTruthy(),
  );
});

it('saves the revised set, and how GST was quoted', async () => {
  await mount({ items: [ITEM] });
  await waitFor(() => expect(screen.getByDisplayValue('1000')).toBeTruthy());
  await fireEvent.changeText(screen.getByLabelText('Rate'), '1200');
  await fireEvent.press(screen.getByText('Save pricing'));

  await waitFor(() => expect(mockUpdateLead).toHaveBeenCalled());
  const [id, body] = mockUpdateLead.mock.calls[0];
  expect(id).toBe('l1');
  expect(body.taxTreatment).toBe('EXCLUSIVE');
  expect(body.items).toEqual([
    {
      name: 'Hdmr 22mm',
      description: undefined,
      hsnSac: '4411',
      quantity: 10,
      unit: 'Sqf',
      ratePerUnit: 1200,
      discountPct: undefined,
      gstSlabId: 'gst18',
    },
  ]);
});

it('sends an empty set when the lines are all taken away — that is clearing it', async () => {
  await mount({ items: [ITEM] });
  await waitFor(() => expect(screen.getByDisplayValue('Hdmr 22mm')).toBeTruthy());
  await fireEvent.press(screen.getByTestId('remove-line-0'));
  await fireEvent.press(screen.getByText('Save pricing'));

  await waitFor(() => expect(mockUpdateLead).toHaveBeenCalled());
  // Deliberately [], not absent: the API reads silence as "leave it alone".
  expect(mockUpdateLead.mock.calls[0][1].items).toEqual([]);
});

it('goes back to the enquiry once it is saved', async () => {
  await mount({ items: [ITEM] });
  await waitFor(() => expect(screen.getByDisplayValue('Hdmr 22mm')).toBeTruthy());
  await fireEvent.press(screen.getByText('Save pricing'));
  await waitFor(() => expect(goBack).toHaveBeenCalled());
});

it('shows the server’s refusal and stays put', async () => {
  mockUpdateLead.mockRejectedValue(new Error('Lead has been converted'));
  await mount({ items: [ITEM] });
  await waitFor(() => expect(screen.getByDisplayValue('Hdmr 22mm')).toBeTruthy());
  await fireEvent.press(screen.getByText('Save pricing'));
  await waitFor(() =>
    expect(Alert.alert).toHaveBeenCalledWith('Could not save', 'Lead has been converted'),
  );
  expect(goBack).not.toHaveBeenCalled();
});
