import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import {
  ClientPicker,
  NO_CLIENT,
  clientLabel,
  clientRef,
  hasClient,
  pickedClient,
  typedClient,
  type ClientChoice,
} from './ClientPicker';

const mockSearchClients = jest.fn();
jest.mock('../api/client', () => ({
  api: { searchClients: (...a: unknown[]) => mockSearchClients(...a) },
}));

const mockContactAccess = jest.fn();
const mockContacts = jest.fn();
jest.mock('../lib/contacts', () => ({
  requestContactsAccess: () => mockContactAccess(),
  loadContacts: () => mockContacts(),
}));

const VERMA = {
  id: 'c1',
  code: 'CL-1',
  name: 'Verma Interiors',
  phone: '9820012345',
  billingAddress: 'Andheri',
};

/** A host that holds the choice, the way every screen using this does. */
function Host({ allowCreate = true, onPick }: { allowCreate?: boolean; onPick?: never }) {
  const [value, setValue] = useState<ClientChoice>(NO_CLIENT);
  return (
    <ClientPicker value={value} onChange={setValue} allowCreate={allowCreate} onPick={onPick} />
  );
}

const openSheet = async () => {
  await fireEvent.press(screen.getByLabelText('Search existing clients'));
  return screen.findByPlaceholderText('Type to search…');
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSearchClients.mockResolvedValue([VERMA]);
  mockContactAccess.mockResolvedValue(true);
  mockContacts.mockResolvedValue([{ id: '1', name: 'Anil Verma', phone: '9829012345' }]);
});

describe('what a screen sends to the API', () => {
  it('is the id when a client was picked', () => {
    expect(clientRef(pickedClient(VERMA))).toEqual({ clientId: 'c1' });
  });

  it('is the new client when a name was typed', () => {
    expect(clientRef(typedClient(' Passing trade ', ' 98200 12345 '))).toEqual({
      newClient: { name: 'Passing trade', phone: '98200 12345' },
    });
  });

  it('leaves the phone off rather than sending an empty one', () => {
    expect(clientRef(typedClient('Passing trade'))).toEqual({
      newClient: { name: 'Passing trade' },
    });
  });

  // Otherwise a half-filled form sends `newClient: { name: '' }`, which the API
  // refuses with a message about a name that is too short rather than one about
  // a client that was never chosen.
  it('is nothing at all when neither was filled in', () => {
    expect(clientRef(NO_CLIENT)).toEqual({});
    expect(clientRef(typedClient('   '))).toEqual({});
  });

  it('knows whether there is anybody to attach the work to', () => {
    expect(hasClient(NO_CLIENT)).toBe(false);
    expect(hasClient(typedClient('  '))).toBe(false);
    expect(hasClient(typedClient('Passing trade'))).toBe(true);
    expect(hasClient(pickedClient(VERMA))).toBe(true);
  });

  it('names who it is, whichever half was used', () => {
    expect(clientLabel(pickedClient(VERMA))).toBe('Verma Interiors');
    expect(clientLabel(typedClient(' Passing trade '))).toBe('Passing trade');
    expect(clientLabel(NO_CLIENT)).toBe('');
  });
});

describe('searching what the shop already has', () => {
  it('does not go looking until something is typed', async () => {
    await render(<Host />);
    await openSheet();
    expect(mockSearchClients).not.toHaveBeenCalled();
  });

  it('searches by name, phone or code', async () => {
    await render(<Host />);
    const box = await openSheet();
    await fireEvent.changeText(box, 'verma');
    await waitFor(() => expect(mockSearchClients).toHaveBeenCalledWith('verma'));
  });

  it('shows who was picked, and stops asking for a new one', async () => {
    await render(<Host />);
    await fireEvent.changeText(await openSheet(), 'verma');
    await fireEvent.press(await screen.findByText('Verma Interiors'));

    expect(screen.getByText('CL-1 · 9820012345')).toBeTruthy();
    expect(screen.queryByText('or add a new one')).toBeNull();
  });

  it('lets the pick be undone', async () => {
    await render(<Host />);
    await fireEvent.changeText(await openSheet(), 'verma');
    await fireEvent.press(await screen.findByText('Verma Interiors'));
    await fireEvent.press(screen.getByLabelText('Clear the client'));

    expect(screen.getByLabelText('Search existing clients')).toBeTruthy();
    expect(screen.getByText('or add a new one')).toBeTruthy();
  });

  /*
   * A search that found nobody used to say "close this and add them as a new
   * client" — an instruction, not a way out. The name had already been typed,
   * and the answer was to go and type it again somewhere else. Now the search
   * term becomes the client, here.
   */
  describe('when nothing matches', () => {
    const searchFor = async (term: string) => {
      mockSearchClients.mockResolvedValue([]);
      await render(<Host />);
      await fireEvent.changeText(await openSheet(), term);
      await screen.findByTestId('picker-add-typed');
    };

    it('names who was looked for rather than only saying no', async () => {
      await searchFor('nobody');
      expect(screen.getByText('Nobody on file matches “nobody”.')).toBeTruthy();
    });

    it('turns what was typed into the new client, without retyping it', async () => {
      await searchFor('Kapoor Glass');
      await fireEvent.press(screen.getByTestId('picker-add-typed'));

      expect(await screen.findByDisplayValue('Kapoor Glass')).toBeTruthy();
    });

    it('closes the search once the name has been taken from it', async () => {
      await searchFor('Kapoor Glass');
      await fireEvent.press(screen.getByTestId('picker-add-typed'));

      await waitFor(() => expect(screen.queryByPlaceholderText('Type to search…')).toBeNull());
    });

    it('offers the phone book as the other way in', async () => {
      await searchFor('nobody');
      expect(screen.getByTestId('picker-contacts-empty')).toBeTruthy();
    });

    it('offers neither when this screen is not allowed to create clients', async () => {
      mockSearchClients.mockResolvedValue([]);
      await render(<Host allowCreate={false} />);
      await fireEvent.changeText(await openSheet(), 'nobody');

      expect(
        await screen.findByText('No match. Only clients the shop has on file can be reported on.'),
      ).toBeTruthy();
      expect(screen.queryByTestId('picker-add-typed')).toBeNull();
      expect(screen.queryByTestId('picker-contacts-empty')).toBeNull();
    });
  });

  /*
   * The address book is read only on a tap, and only the one contact chosen
   * ever leaves the device.
   */
  describe('from the phone book', () => {
    it('fills the new client from the contact that was picked', async () => {
      await render(<Host />);
      await fireEvent.press(screen.getByTestId('picker-contacts'));
      await fireEvent.press(await screen.findByText('Anil Verma'));

      expect(await screen.findByDisplayValue('Anil Verma')).toBeTruthy();
      expect(screen.getByDisplayValue('9829012345')).toBeTruthy();
    });

    it('does not read the address book until somebody asks it to', async () => {
      await render(<Host />);
      expect(mockContactAccess).not.toHaveBeenCalled();
      expect(mockContacts).not.toHaveBeenCalled();
    });

    it('is not offered where this screen cannot create clients', async () => {
      await render(<Host allowCreate={false} />);
      expect(screen.queryByTestId('picker-contacts')).toBeNull();
    });
  });

  // A failing lookup must not take the screen down mid-order.
  it('shows no results rather than crashing when the search fails', async () => {
    mockSearchClients.mockRejectedValue(new Error('offline'));
    await render(<Host />);
    await fireEvent.changeText(await openSheet(), 'verma');

    expect(await screen.findByPlaceholderText('Type to search…')).toBeTruthy();
  });

  it('forgets the last search when the sheet is closed', async () => {
    await render(<Host />);
    await fireEvent.changeText(await openSheet(), 'verma');
    await screen.findByText('Verma Interiors');
    await fireEvent.press(screen.getByTestId('sheet-backdrop'));
    await openSheet();

    expect(screen.getByPlaceholderText('Type to search…').props.value).toBe('');
  });
});

describe('adding somebody who is not on file', () => {
  it('takes a name and a phone', async () => {
    await render(<Host />);
    await fireEvent.changeText(screen.getByPlaceholderText('Who is it for?'), 'Passing trade');
    expect(screen.getByDisplayValue('Passing trade')).toBeTruthy();
  });

  it('says what the phone number is for', async () => {
    await render(<Host />);
    expect(
      screen.getByText('If this number is already on file, it attaches to them.'),
    ).toBeTruthy();
  });

  it('is not offered at all where the client is a subject rather than a party', async () => {
    await render(<Host allowCreate={false} />);

    expect(screen.getByLabelText('Search existing clients')).toBeTruthy();
    expect(screen.queryByText('or add a new one')).toBeNull();
    expect(screen.queryByPlaceholderText('Who is it for?')).toBeNull();
  });

  it('does not tell a report to add a client it cannot add', async () => {
    mockSearchClients.mockResolvedValue([]);
    await render(<Host allowCreate={false} />);
    await fireEvent.changeText(await openSheet(), 'nobody');

    expect(screen.queryByText('No match. Close this and add them as a new client.')).toBeNull();
    expect(await screen.findByText(/Only clients the shop has on file/)).toBeTruthy();
  });
});
