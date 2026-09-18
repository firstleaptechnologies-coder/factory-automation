import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { ApiError } from '@fas/shared';
import { ClientNewScreen } from './ClientNewScreen';

const mockCreate = jest.fn();
jest.mock('../api/client', () => ({
  api: { createClient: (...a: unknown[]) => mockCreate(...a) },
}));

const mockLoad = jest.fn();
const mockAccess = jest.fn();
jest.mock('../lib/contacts', () => ({
  requestContactsAccess: () => mockAccess(),
  loadContacts: () => mockLoad(),
}));

const navigation = { goBack: jest.fn(), replace: jest.fn(), navigate: jest.fn() };

async function mount(params?: Record<string, unknown>) {
  await render(<ClientNewScreen route={{ params }} navigation={navigation} />);
}

const typeName = (name: string) => fireEvent.changeText(screen.getByPlaceholderText('Who the work is for'), name);
const typePhone = (phone: string) =>
  fireEvent.changeText(
    screen.getByPlaceholderText('Optional, but it is what they are found by'),
    phone,
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockAccess.mockResolvedValue(true);
  mockLoad.mockResolvedValue([]);
});

it('adds a client with nothing but a name — a GSTIN is not a condition', async () => {
  mockCreate.mockResolvedValue({ id: 'c9' });
  await mount();

  await typeName('Verma Interiors');
  await fireEvent.press(screen.getByTestId('save-client'));

  await waitFor(() => expect(mockCreate).toHaveBeenCalledWith({ name: 'Verma Interiors' }));
});

it('will not save a name too short to be one', async () => {
  await mount();
  await typeName('V');
  await fireEvent.press(screen.getByTestId('save-client'));
  expect(mockCreate).not.toHaveBeenCalled();
});

it('sends only the fields that were filled in, not a row of empty strings', async () => {
  mockCreate.mockResolvedValue({ id: 'c9' });
  await mount();

  await typeName('  Verma Interiors  ');
  await typePhone('9829012345');
  await fireEvent.press(screen.getByTestId('save-client'));

  await waitFor(() =>
    expect(mockCreate).toHaveBeenCalledWith({
      name: 'Verma Interiors',
      phone: '9829012345',
    }),
  );
});

it('starts from the name that was searched for, when it came from a search', async () => {
  await mount({ name: 'Verma' });
  expect(screen.getByDisplayValue('Verma')).toBeTruthy();
});

/*
 * Going back from a client that was just added should reach the list it was
 * added to — not the empty form it was added on, which invites adding them
 * a second time.
 */
it('replaces the form with the new client rather than stacking on top of it', async () => {
  mockCreate.mockResolvedValue({ id: 'c9' });
  await mount();

  await typeName('Verma Interiors');
  await fireEvent.press(screen.getByTestId('save-client'));

  await waitFor(() =>
    expect(navigation.replace).toHaveBeenCalledWith('ClientDetail', { clientId: 'c9' }),
  );
});

/*
 * A firm existing twice is a ledger split in two. The server refuses it and
 * names the client that exists — which is almost certainly the one being
 * looked for, so the refusal has to lead somewhere.
 */
describe('when the number is already on file', () => {
  const conflict = () =>
    new ApiError(409, 'Verma Interiors (CLI-7) already has this number.', {
      existing: { id: 'c1', name: 'Verma Interiors', code: 'CLI-7', phone: '9829012345' },
    });

  const add = async () => {
    mockCreate.mockRejectedValue(conflict());
    await mount();
    await typeName('Verma Interiors');
    await typePhone('9829012345');
    await fireEvent.press(screen.getByTestId('save-client'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    return (Alert.alert as jest.Mock).mock.calls[0];
  };

  beforeEach(() => jest.spyOn(Alert, 'alert').mockImplementation(() => {}));

  it('names the client that already has it', async () => {
    const [title, message] = await add();
    expect(title).toBe('Already on file');
    expect(message).toContain('Verma Interiors (CLI-7)');
  });

  it('offers to open them instead of leaving it at a refusal', async () => {
    const [, , buttons] = await add();
    const open = buttons.find((b: { text: string }) => b.text.startsWith('Open'));
    open.onPress();
    expect(navigation.replace).toHaveBeenCalledWith('ClientDetail', { clientId: 'c1' });
  });

  it('also lets the number be corrected, for when it is somebody else', async () => {
    const [, , buttons] = await add();
    expect(buttons.some((b: { text: string }) => b.text === 'Change the number')).toBe(true);
  });

  it('does not navigate anywhere on its own', async () => {
    await add();
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});

it('reports an ordinary failure as itself, not as a duplicate', async () => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockCreate.mockRejectedValue(new ApiError(500, 'Server is down'));
  await mount();

  await typeName('Verma Interiors');
  await fireEvent.press(screen.getByTestId('save-client'));

  await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Could not add', 'Server is down'));
});

/*
 * The address book is read only on a tap, and only the one contact chosen
 * leaves the device. Permission refused leaves a form that always worked on
 * its own — this screen is never blocked on contacts.
 */
describe('from the phone book', () => {
  it('fills the form from the contact that was picked', async () => {
    mockLoad.mockResolvedValue([
      { id: '1', name: 'Anil Verma', phone: '9829012345', company: 'Verma & Sons' },
    ]);
    await mount();

    await fireEvent.press(screen.getByTestId('from-contacts'));
    await fireEvent.press(await screen.findByText('Anil Verma'));

    await waitFor(() => expect(screen.getByDisplayValue('Anil Verma')).toBeTruthy());
    expect(screen.getByDisplayValue('9829012345')).toBeTruthy();
    expect(screen.getByDisplayValue('Verma & Sons')).toBeTruthy();
  });

  it('does not read the address book until somebody asks it to', async () => {
    await mount();
    expect(mockAccess).not.toHaveBeenCalled();
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('leaves the form usable when permission is refused', async () => {
    mockAccess.mockResolvedValue(false);
    mockCreate.mockResolvedValue({ id: 'c9' });
    await mount();

    await fireEvent.press(screen.getByTestId('from-contacts'));
    await waitFor(() => expect(mockAccess).toHaveBeenCalled());
    expect(mockLoad).not.toHaveBeenCalled();

    await typeName('Verma Interiors');
    await fireEvent.press(screen.getByTestId('save-client'));
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
  });

  it('does not write over a number somebody has already corrected', async () => {
    mockLoad.mockResolvedValue([{ id: '1', name: 'Anil Verma', phone: '9829012345' }]);
    mockCreate.mockResolvedValue({ id: 'c9' });
    await mount();

    await typePhone('9820000000');
    await fireEvent.press(screen.getByTestId('from-contacts'));
    await fireEvent.press(await screen.findByText('Anil Verma'));

    await waitFor(() => expect(screen.getByDisplayValue('Anil Verma')).toBeTruthy());
    expect(screen.getByDisplayValue('9820000000')).toBeTruthy();
  });
});
