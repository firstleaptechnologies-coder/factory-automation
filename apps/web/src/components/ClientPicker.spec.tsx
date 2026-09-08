import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ClientPicker } from './ClientPicker';

const searchClients = jest.fn();
jest.mock('@/lib/api', () => ({ api: { searchClients: (term: string) => searchClients(term) } }));

const CLIENT = {
  id: 'c1',
  code: 'CLI-1',
  name: 'Verma Interiors',
  phone: '9820012345',
  company: 'Verma & Sons',
};

function mount(value: unknown = null) {
  const onChange = jest.fn();
  const view = render(<ClientPicker value={value as never} onChange={onChange} />);
  return { onChange, view };
}

async function type(text: string) {
  fireEvent.change(screen.getByPlaceholderText('Type a name or phone…'), {
    target: { value: text },
  });
  // The search is debounced so a fast typist does not fire a request per key.
  await act(async () => {
    jest.advanceTimersByTime(250);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  searchClients.mockReset().mockResolvedValue([CLIENT]);
});
afterEach(() => jest.useRealTimers());

it('does not search until something is typed', () => {
  mount();
  act(() => {
    jest.advanceTimersByTime(500);
  });
  expect(searchClients).not.toHaveBeenCalled();
});

it('searches once for a burst of typing', async () => {
  mount();
  const input = screen.getByPlaceholderText('Type a name or phone…');
  for (const text of ['v', 've', 'ver', 'verm']) {
    fireEvent.change(input, { target: { value: text } });
    act(() => {
      jest.advanceTimersByTime(50);
    });
  }
  await act(async () => {
    jest.advanceTimersByTime(250);
  });
  expect(searchClients).toHaveBeenCalledTimes(1);
  expect(searchClients).toHaveBeenCalledWith('verm');
});

it('shows a match with everything needed to tell two apart', async () => {
  mount();
  await type('verma');
  expect(screen.getByText('Verma Interiors')).toBeInTheDocument();
  expect(screen.getByText(/CLI-1 · 9820012345 · Verma & Sons/)).toBeInTheDocument();
});

it('picks a client from the list', async () => {
  const { onChange } = mount();
  await type('verma');
  fireEvent.click(screen.getByText('Verma Interiors'));
  expect(onChange).toHaveBeenCalledWith({ client: CLIENT });
});

it('shows nothing rather than an error when the search fails', async () => {
  searchClients.mockRejectedValue(new Error('down'));
  mount();
  await type('verma');
  expect(screen.getByText(/Create/)).toBeInTheDocument();
});

it('always offers to create the name that was typed', async () => {
  mount();
  await type('New Shop');
  expect(screen.getByText('+ Create “New Shop”')).toBeInTheDocument();
});

it('closes the list when the page is clicked elsewhere', async () => {
  mount();
  await type('verma');
  fireEvent.mouseDown(document.body);
  await waitFor(() => expect(screen.queryByText('Verma Interiors')).not.toBeInTheDocument());
});

describe('once a client is chosen', () => {
  it('shows who it is instead of the search box', () => {
    mount({ client: CLIENT });
    expect(screen.getByText('Verma Interiors')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Type a name or phone…')).not.toBeInTheDocument();
  });

  it('does not keep searching', () => {
    mount({ client: CLIENT });
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(searchClients).not.toHaveBeenCalled();
  });

  it('can be changed back', () => {
    const { onChange } = mount({ client: CLIENT });
    fireEvent.click(screen.getByText('Change'));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});

describe('creating one inline', () => {
  async function startCreating() {
    const view = mount();
    await type('New Shop');
    fireEvent.click(screen.getByText('+ Create “New Shop”'));
    return view;
  }

  it('carries the typed name straight into the new client', async () => {
    const { onChange } = await startCreating();
    // The person punching is usually on the phone with the client.
    expect(onChange).toHaveBeenLastCalledWith({
      newClient: { name: 'New Shop', phone: '' },
    });
  });

  it('reports the phone as it is typed', async () => {
    const { onChange } = await startCreating();
    fireEvent.change(screen.getByPlaceholderText('Phone'), {
      target: { value: '9820012345' },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      newClient: { name: 'New Shop', phone: '9820012345' },
    });
  });

  it('says a matching phone number will attach to the existing client', async () => {
    await startCreating();
    expect(screen.getByText(/instead of creating a duplicate/)).toBeInTheDocument();
  });

  it('can go back to searching, clearing what was half-entered', async () => {
    const { onChange } = await startCreating();
    fireEvent.click(screen.getByText('Search instead'));
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(screen.getByPlaceholderText('Type a name or phone…')).toBeInTheDocument();
  });
});
