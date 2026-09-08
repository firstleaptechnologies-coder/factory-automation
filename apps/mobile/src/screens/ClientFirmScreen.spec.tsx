import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ClientFirmScreen } from './ClientFirmScreen';

const mockClient = jest.fn();
const mockUpdateClient = jest.fn();
jest.mock('../api/client', () => ({
  api: {
    client: (...a: unknown[]) => mockClient(...a),
    updateClient: (...a: unknown[]) => mockUpdateClient(...a),
  },
}));

jest.mock('../lib/contacts', () => ({
  requestContactsAccess: async () => true,
  loadContacts: async () => [
    {
      id: '1',
      name: 'Ramesh Verma',
      phone: '9811100022',
      email: 'ramesh@example.com',
      company: 'Verma & Sons',
    },
  ],
}));

const CLIENT = {
  id: 'c1',
  code: 'CLI-1',
  name: 'Verma Interiors',
  company: null,
  phone: null,
  altPhone: null,
  email: null,
  gstin: null,
  stateCode: null,
  stateName: null,
  address: null,
  billingAddress: null,
  shippingAddress: null,
  notes: null,
};

const goBack = jest.fn();

async function mount(over: Record<string, unknown> = {}) {
  mockClient.mockResolvedValue({ ...CLIENT, ...over });
  await render(
    <ClientFirmScreen route={{ params: { clientId: 'c1' } }} navigation={{ goBack }} />,
  );
  await screen.findByText('Firm details');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdateClient.mockResolvedValue({});
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

it('loads what is already on file', async () => {
  await mount({ gstin: '27AAAAA0000A1Z5' });
  expect(await screen.findByDisplayValue('Verma Interiors')).toBeTruthy();
  expect(screen.getByDisplayValue('27AAAAA0000A1Z5')).toBeTruthy();
});

it('keeps every optional field optional', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Save'));
  await waitFor(() => expect(mockUpdateClient).toHaveBeenCalled());
  const body = mockUpdateClient.mock.calls[0][1];
  expect(body.name).toBe('Verma Interiors');
  expect(body.gstin).toBeUndefined();
  expect(body.billingAddress).toBeUndefined();
});

it('saves a billing and a shipping address separately', async () => {
  await mount();
  await fireEvent.changeText(screen.getByPlaceholderText('08AAWFD7264P1ZC'), '27AAAAA0000A1Z5');
  await fireEvent.press(screen.getByText('Save'));
  await waitFor(() => expect(mockUpdateClient).toHaveBeenCalled());
  expect(mockUpdateClient.mock.calls[0][1].gstin).toBe('27AAAAA0000A1Z5');
});

it('goes back once it is saved', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Save'));
  await waitFor(() => expect(goBack).toHaveBeenCalled());
});

it('shows the server’s refusal and stays on the form', async () => {
  mockUpdateClient.mockRejectedValue(new Error('Client c1 not found'));
  await mount();
  await fireEvent.press(screen.getByText('Save'));
  await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
  expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe('Could not save');
  expect(goBack).not.toHaveBeenCalled();
});

describe('filling from the address book', () => {
  it('fills the fields that are still empty', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Fill from contacts'));
    await fireEvent.press(await screen.findByText('Ramesh Verma'));
    expect(await screen.findByDisplayValue('9811100022')).toBeTruthy();
    expect(screen.getByDisplayValue('ramesh@example.com')).toBeTruthy();
    expect(screen.getByDisplayValue('Verma & Sons')).toBeTruthy();
  });

  it('does not overwrite a number somebody deliberately corrected', async () => {
    await mount({ phone: '9820012345' });
    await fireEvent.press(screen.getByText('Fill from contacts'));
    await fireEvent.press(await screen.findByText('Ramesh Verma'));
    expect(screen.getByDisplayValue('9820012345')).toBeTruthy();
    expect(screen.queryByDisplayValue('9811100022')).toBeNull();
  });

  it('leaves the name alone when there is already one', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Fill from contacts'));
    await fireEvent.press(await screen.findByText('Ramesh Verma'));
    // The client is already called Verma Interiors; the contact is a person.
    expect(screen.getByDisplayValue('Verma Interiors')).toBeTruthy();
  });
});
