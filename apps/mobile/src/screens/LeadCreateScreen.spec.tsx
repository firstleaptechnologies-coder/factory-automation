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
