import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { LeadItemsScreen } from './LeadItemsScreen';

const mockLead = jest.fn();
const mockUpdateLead = jest.fn();
jest.mock('../api/client', () => ({
  api: {
    lead: (...a: unknown[]) => mockLead(...a),
    updateLead: (...a: unknown[]) => mockUpdateLead(...a),
  },
}));

const ITEM = {
  id: 'li1',
  lineNo: 1,
  name: 'Hdmr 22mm',
  description: 'Laser cut',
  quantity: '10',
  unit: 'Sqf',
  ratePerUnit: '1000',
  discountPct: '0',
  discountAmount: '0',
  amount: '10000',
};

const goBack = jest.fn();

async function mount(over: Record<string, unknown> = {}) {
  mockLead.mockResolvedValue({ id: 'l1', code: 'LEAD-1', items: [], ...over });
  await render(
    <LeadItemsScreen route={{ params: { leadId: 'l1' } }} navigation={{ goBack }} />,
  );
  await screen.findByText('Items');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdateLead.mockResolvedValue({});
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

it('opens on what the enquiry already lists', async () => {
  await mount({ items: [ITEM] });
  await waitFor(() =>
    expect(screen.getByDisplayValue('Hdmr 22mm')).toBeTruthy(),
  );
  expect(screen.getByDisplayValue('10')).toBeTruthy();
  expect(screen.getByDisplayValue('1000')).toBeTruthy();
});

it('opens on one blank line for an enquiry with nothing listed yet', async () => {
  await mount();
  await waitFor(() =>
    expect(screen.getByPlaceholderText('MDF jali, laser cut')).toBeTruthy(),
  );
});

it('saves the revised set, and says nothing about GST', async () => {
  await mount({ items: [ITEM] });
  await waitFor(() => expect(screen.getByDisplayValue('1000')).toBeTruthy());
  await fireEvent.changeText(screen.getByLabelText('Rate'), '1200');
  await fireEvent.press(screen.getByText('Save items'));

  await waitFor(() => expect(mockUpdateLead).toHaveBeenCalled());
  const [id, body] = mockUpdateLead.mock.calls[0];
  expect(id).toBe('l1');
  // An enquiry is not a tax document; nothing about tax goes with it.
  expect(body).not.toHaveProperty('taxTreatment');
  expect(body.items).toEqual([
    {
      name: 'Hdmr 22mm',
      description: 'Laser cut',
      unit: 'Sqf',
      quantity: 10,
      ratePerUnit: 1200,
      discountPct: undefined,
    },
  ]);
});

it('sends an empty set when the items are all taken away — that is clearing it', async () => {
  await mount({ items: [ITEM] });
  await waitFor(() => expect(screen.getByDisplayValue('Hdmr 22mm')).toBeTruthy());
  await fireEvent.press(screen.getByTestId('remove-line-0'));
  await fireEvent.press(screen.getByText('Save items'));

  await waitFor(() => expect(mockUpdateLead).toHaveBeenCalled());
  // Deliberately [], not absent: the API reads silence as "leave it alone".
  expect(mockUpdateLead.mock.calls[0][1].items).toEqual([]);
});

it('goes back to the enquiry once it is saved', async () => {
  await mount({ items: [ITEM] });
  await waitFor(() => expect(screen.getByDisplayValue('Hdmr 22mm')).toBeTruthy());
  await fireEvent.press(screen.getByText('Save items'));
  await waitFor(() => expect(goBack).toHaveBeenCalled());
});

it('offers no GST anywhere on the screen', async () => {
  await mount({ items: [ITEM] });
  await waitFor(() => expect(screen.getByDisplayValue('Hdmr 22mm')).toBeTruthy());
  expect(screen.queryByText('GST on top')).toBeNull();
  expect(screen.queryByTestId('slab-0')).toBeNull();
  expect(screen.queryByText('+ HSN/SAC')).toBeNull();
});

it('shows the server’s refusal and stays put', async () => {
  mockUpdateLead.mockRejectedValue(new Error('Lead has been converted'));
  await mount({ items: [ITEM] });
  await waitFor(() => expect(screen.getByDisplayValue('Hdmr 22mm')).toBeTruthy());
  await fireEvent.press(screen.getByText('Save items'));
  await waitFor(() =>
    expect(Alert.alert).toHaveBeenCalledWith('Could not save', 'Lead has been converted'),
  );
  expect(goBack).not.toHaveBeenCalled();
});
