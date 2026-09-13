import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

const searchClients = jest.fn();
jest.mock('@/lib/api', () => ({ api: { searchClients: (term: string) => searchClients(term) } }));

const VERMA = {
  id: 'c1',
  code: 'CLI-1',
  name: 'Verma Interiors',
  phone: '9820012345',
  billingAddress: 'Andheri',
};

/** A host that holds the choice, the way every page using this does. */
function Host({ allowCreate = true }: { allowCreate?: boolean }) {
  const [value, setValue] = useState<ClientChoice>(NO_CLIENT);
  return <ClientPicker value={value} onChange={setValue} allowCreate={allowCreate} />;
}

const openSheet = () => {
  fireEvent.click(screen.getByLabelText('Search existing clients'));
  return screen.findByPlaceholderText('Type to search…');
};

const type = async (text: string) => {
  const box = await openSheet();
  fireEvent.change(box, { target: { value: text } });
  return box;
};

beforeEach(() => {
  searchClients.mockReset().mockResolvedValue([VERMA]);
});

/*
 * The same contract the app's picker exports, in
 * `apps/mobile/src/components/ClientPicker`. Both ends of it are tested on both
 * clients on purpose: a change to one that the other did not get is exactly how
 * the same customer ended up entered three different ways.
 */
describe('what a page sends to the API', () => {
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
    render(<Host />);
    await openSheet();
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(searchClients).not.toHaveBeenCalled();
  });

  it('searches by name, phone or code', async () => {
    render(<Host />);
    await type('verma');
    await waitFor(() => expect(searchClients).toHaveBeenCalledWith('verma'));
  });

  it('searches once for a burst of typing, on the last thing typed', async () => {
    render(<Host />);
    const box = await openSheet();
    for (const text of ['v', 've', 'ver', 'verm']) {
      fireEvent.change(box, { target: { value: text } });
    }
    await waitFor(() => expect(searchClients).toHaveBeenCalledTimes(1));
    expect(searchClients).toHaveBeenCalledWith('verm');
  });

  it('shows who was picked, and stops asking for a new one', async () => {
    render(<Host />);
    await type('verma');
    fireEvent.click(await screen.findByText('Verma Interiors'));

    expect(screen.getByText('CLI-1 · 9820012345')).toBeInTheDocument();
    expect(screen.queryByText('or add a new one')).not.toBeInTheDocument();
  });

  it('lets the pick be undone', async () => {
    render(<Host />);
    await type('verma');
    fireEvent.click(await screen.findByText('Verma Interiors'));
    fireEvent.click(screen.getByLabelText('Clear the client'));

    expect(screen.getByLabelText('Search existing clients')).toBeInTheDocument();
    expect(screen.getByText('or add a new one')).toBeInTheDocument();
  });

  it('says so when nothing matches, and points at the other half', async () => {
    searchClients.mockResolvedValue([]);
    render(<Host />);
    await type('nobody');

    expect(
      await screen.findByText('No match. Close this and add them as a new client.'),
    ).toBeInTheDocument();
  });

  // A failing lookup must not take the page down mid-order.
  it('shows no results rather than crashing when the search fails', async () => {
    searchClients.mockRejectedValue(new Error('offline'));
    render(<Host />);
    await type('verma');

    expect(await screen.findByPlaceholderText('Type to search…')).toBeInTheDocument();
  });

  it('forgets the last search when the sheet is closed', async () => {
    render(<Host />);
    await type('verma');
    await screen.findByText('Verma Interiors');
    fireEvent.click(screen.getByLabelText('Close'));
    const box = await openSheet();

    expect(box).toHaveValue('');
  });
});

describe('adding somebody who is not on file', () => {
  it('takes a name and a phone', () => {
    render(<Host />);
    fireEvent.change(screen.getByPlaceholderText('Who is it for?'), {
      target: { value: 'Passing trade' },
    });
    expect(screen.getByDisplayValue('Passing trade')).toBeInTheDocument();
  });

  it('says what the phone number is for', () => {
    render(<Host />);
    expect(
      screen.getByText('If this number is already on file, it attaches to them.'),
    ).toBeInTheDocument();
  });

  it('is not offered at all where the client is a subject rather than a party', () => {
    render(<Host allowCreate={false} />);

    expect(screen.getByLabelText('Search existing clients')).toBeInTheDocument();
    expect(screen.queryByText('or add a new one')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Who is it for?')).not.toBeInTheDocument();
  });

  it('does not tell a report to add a client it cannot add', async () => {
    searchClients.mockResolvedValue([]);
    render(<Host allowCreate={false} />);
    await type('nobody');

    expect(
      screen.queryByText('No match. Close this and add them as a new client.'),
    ).not.toBeInTheDocument();
    expect(await screen.findByText(/Only clients the shop has on file/)).toBeInTheDocument();
  });
});
