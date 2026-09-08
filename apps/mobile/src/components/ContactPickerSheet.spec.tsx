import { Alert, Linking } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ContactPickerSheet } from './ContactPickerSheet';

const mockRequestAccess = jest.fn();
const mockLoadContacts = jest.fn();
jest.mock('../lib/contacts', () => ({
  requestContactsAccess: () => mockRequestAccess(),
  loadContacts: () => mockLoadContacts(),
}));

const CONTACTS = [
  { id: '1', name: 'Ramesh Verma', phone: '9820012345', company: 'Verma Interiors' },
  { id: '2', name: 'Iqbal Sheikh', phone: '9811100022' },
];

async function mount(props: Record<string, unknown> = {}) {
  const onPick = jest.fn();
  const onClose = jest.fn();
  await render(
    <ContactPickerSheet visible onClose={onClose} onPick={onPick} {...props} />,
  );
  return { onPick, onClose };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequestAccess.mockResolvedValue(true);
  mockLoadContacts.mockResolvedValue(CONTACTS);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(Linking, 'openSettings').mockImplementation(async () => {});
});

it('does not touch the address book until the sheet is opened', async () => {
  await mount({ visible: false });
  // Read only on an explicit tap, never in the background.
  expect(mockRequestAccess).not.toHaveBeenCalled();
});

it('asks for permission and lists what it found', async () => {
  await mount();
  expect(await screen.findByText('Ramesh Verma')).toBeTruthy();
  expect(screen.getByText('Iqbal Sheikh')).toBeTruthy();
});

it('shows the number and firm beside the name, so two Rameshes can be told apart', async () => {
  await mount();
  expect(await screen.findByText('9820012345 · Verma Interiors')).toBeTruthy();
});

it('explains itself when contacts are turned off, and offers settings', async () => {
  mockRequestAccess.mockResolvedValue(false);
  await mount();
  expect(await screen.findByText('Contacts are off')).toBeTruthy();
  await fireEvent.press(screen.getByText('Open settings'));
  expect(Linking.openSettings).toHaveBeenCalled();
  expect(mockLoadContacts).not.toHaveBeenCalled();
});

it('says it is working while the book is being read', async () => {
  mockLoadContacts.mockReturnValue(new Promise(() => {}));
  await mount();
  expect(await screen.findByText('Reading your contacts')).toBeTruthy();
});

it('reports a failure to read and closes rather than hanging', async () => {
  mockLoadContacts.mockRejectedValue(new Error('Address book unavailable'));
  const { onClose } = await mount();
  await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
  expect(onClose).toHaveBeenCalled();
});

it('filters by name as you type', async () => {
  await mount();
  await screen.findByText('Ramesh Verma');
  await fireEvent.changeText(screen.getByPlaceholderText('Name or number'), 'iqbal');
  await waitFor(() => expect(screen.queryByText('Ramesh Verma')).toBeNull());
  expect(screen.getByText('Iqbal Sheikh')).toBeTruthy();
});

it('filters by number, ignoring how it was punctuated', async () => {
  await mount();
  await screen.findByText('Ramesh Verma');
  await fireEvent.changeText(screen.getByPlaceholderText('Name or number'), '98200-1');
  await waitFor(() => expect(screen.queryByText('Iqbal Sheikh')).toBeNull());
  expect(screen.getByText('Ramesh Verma')).toBeTruthy();
});

it('does not return the whole address book when the term has no digits', async () => {
  await mount();
  await screen.findByText('Ramesh Verma');
  // An empty digit string is contained in every phone number, so the number
  // branch used to match everyone the moment a name was typed.
  await fireEvent.changeText(screen.getByPlaceholderText('Name or number'), 'verma');
  await waitFor(() => expect(screen.queryByText('Iqbal Sheikh')).toBeNull());
});

it('says when nobody matches', async () => {
  await mount();
  await screen.findByText('Ramesh Verma');
  await fireEvent.changeText(screen.getByPlaceholderText('Name or number'), 'zzz');
  expect(await screen.findByText('Nobody matches')).toBeTruthy();
});

it('hands back the one contact that was picked, and closes', async () => {
  const { onPick, onClose } = await mount();
  await fireEvent.press(await screen.findByText('Ramesh Verma'));
  // The list stays on the device; this is the only thing that becomes a client.
  expect(onPick).toHaveBeenCalledWith(CONTACTS[0]);
  expect(onClose).toHaveBeenCalled();
});

it('caps a long address book and says so', async () => {
  const many = Array.from({ length: 200 }, (_, i) => ({
    id: String(i),
    name: `Person ${i}`,
    phone: `98000000${String(i).padStart(2, '0')}`,
  }));
  mockLoadContacts.mockResolvedValue(many);
  await mount();
  expect(await screen.findByText('Showing 120 of 200. Search to narrow it.')).toBeTruthy();
});

it('takes its own title, for picking a payee rather than a client', async () => {
  await mount({ title: 'Pick a payee' });
  expect(screen.getByText('Pick a payee')).toBeTruthy();
});
