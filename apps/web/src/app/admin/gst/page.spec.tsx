import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import GstPage from './page';

jest.mock('@/components/Shell', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const apiMock = { gstSlabs: jest.fn(), createGstSlab: jest.fn(), updateGstSlab: jest.fn() };
jest.mock('@/lib/api', () => ({
  api: new Proxy(
    {},
    {
      get: (_t, key: string) => (...args: unknown[]) =>
        apiMock[key as keyof typeof apiMock](...(args as [never])),
    },
  ),
}));

const SLABS = [
  { id: 'g18', name: 'GST 18%', ratePct: '18', isDefault: true, isActive: true, sortOrder: 0 },
  { id: 'g5', name: 'GST 5%', ratePct: '5', isDefault: false, isActive: true, sortOrder: 1 },
  { id: 'g0', name: 'Exempt', ratePct: '0', isDefault: false, isActive: false, sortOrder: 2 },
];

async function mount(slabs: unknown[] = SLABS) {
  apiMock.gstSlabs.mockResolvedValue(slabs);
  render(<GstPage />);
  await screen.findByText('GST rates');
}

beforeEach(() => {
  jest.clearAllMocks();
  apiMock.createGstSlab.mockResolvedValue({});
  apiMock.updateGstSlab.mockResolvedValue({});
});

it('lists every rate, including the ones switched off', async () => {
  await mount();

  // Switched off still has to be visible — it is how you switch it back on.
  expect(apiMock.gstSlabs).toHaveBeenCalledWith(true);
  expect(await screen.findByText('GST 18%')).toBeInTheDocument();
  expect(screen.getByText('Exempt')).toBeInTheDocument();
  expect(screen.getByText('Off')).toBeInTheDocument();
});

it('counts only the rates actually on offer', async () => {
  await mount();
  expect(await screen.findByText('2 in use')).toBeInTheDocument();
});

it('says which one is used unless another is picked', async () => {
  await mount();
  expect(await screen.findByText('Default')).toBeInTheDocument();
});

it('spells out what each rate becomes on a bill', async () => {
  await mount();

  // A shop billing out of state charges IGST at the full rate, not half of it
  // twice — worth showing rather than leaving to be remembered.
  expect(
    await screen.findByText('9% CGST + 9% SGST at home, 18% IGST out of state'),
  ).toBeInTheDocument();
});

/*
 * The state that made this page necessary. A workspace whose slabs were never
 * seeded had every order and quote priced at 0%, and a registered dealer's
 * bills went out with no tax on them — with nothing anywhere saying so.
 */
describe('a shop with no rates at all', () => {
  it('says what that actually costs them', async () => {
    await mount([]);

    expect(await screen.findByTestId('no-slabs')).toBeInTheDocument();
    expect(screen.getByText(/every order and quote is priced at 0%/)).toBeInTheDocument();
  });

  it('keeps that warning off a shop that has some', async () => {
    await mount();
    await screen.findByText('GST 18%');
    expect(screen.queryByTestId('no-slabs')).toBeNull();
  });
});

describe('adding one', () => {
  const open = async () => {
    await mount([]);
    fireEvent.click(screen.getByText('Add a rate'));
  };

  it('will not add one without a name and a rate', async () => {
    await open();
    expect(screen.getByText('Add it').closest('button')).toBeDisabled();
  });

  it('sends the rate as a number, not the string it comes back as', async () => {
    await open();
    fireEvent.change(screen.getByPlaceholderText('GST 18%'), { target: { value: 'GST 12%' } });
    fireEvent.change(screen.getByPlaceholderText('18'), { target: { value: '12' } });
    fireEvent.click(screen.getByText('Add it'));

    await waitFor(() =>
      expect(apiMock.createGstSlab).toHaveBeenCalledWith({
        name: 'GST 12%',
        ratePct: 12,
        isDefault: false,
      }),
    );
  });

  it('lets the new one be made the default', async () => {
    await open();
    fireEvent.change(screen.getByPlaceholderText('GST 18%'), { target: { value: 'GST 18%' } });
    fireEvent.change(screen.getByPlaceholderText('18'), { target: { value: '18' } });
    fireEvent.click(screen.getByText('Use unless another is picked'));
    fireEvent.click(screen.getByText('Add it'));

    await waitFor(() => expect(apiMock.createGstSlab.mock.calls[0][0].isDefault).toBe(true));
  });

  /*
   * Typing then immediately clicking a chip used to lose what was typed.
   *
   * Both handlers run before React re-renders, so the chip's spread of `form`
   * carried a `name` from an earlier render and wrote it back over the letters
   * since. The field on screen still showed the full name, so nothing looked
   * wrong until the list came back.
   */
  it('keeps what was typed when a chip is clicked in the same breath', async () => {
    await open();

    act(() => {
      fireEvent.change(screen.getByPlaceholderText('GST 18%'), { target: { value: 'GST 18%' } });
      fireEvent.change(screen.getByPlaceholderText('18'), { target: { value: '18' } });
      fireEvent.click(screen.getByText('Use unless another is picked'));
    });
    fireEvent.click(screen.getByText('Add it'));

    await waitFor(() =>
      expect(apiMock.createGstSlab).toHaveBeenCalledWith({
        name: 'GST 18%',
        ratePct: 18,
        isDefault: true,
      }),
    );
  });

  it('refuses a rate that is not a rate', async () => {
    await open();
    fireEvent.change(screen.getByPlaceholderText('GST 18%'), { target: { value: 'Nonsense' } });
    fireEvent.change(screen.getByPlaceholderText('18'), { target: { value: '900' } });

    expect(screen.getByText('Add it').closest('button')).toBeDisabled();
  });

  it('shows the server’s refusal rather than losing what was typed', async () => {
    apiMock.createGstSlab.mockRejectedValue(new Error('A rate called GST 18% already exists'));
    await open();
    fireEvent.change(screen.getByPlaceholderText('GST 18%'), { target: { value: 'GST 18%' } });
    fireEvent.change(screen.getByPlaceholderText('18'), { target: { value: '18' } });
    fireEvent.click(screen.getByText('Add it'));

    expect(await screen.findByText('A rate called GST 18% already exists')).toBeInTheDocument();
    expect(screen.getByDisplayValue('GST 18%')).toBeInTheDocument();
  });
});

describe('changing one', () => {
  const open = async () => {
    await mount();
    fireEvent.click(await screen.findByText('GST 5%'));
  };

  it('opens with what is already there', async () => {
    await open();
    expect(screen.getByDisplayValue('GST 5%')).toBeInTheDocument();
    expect(screen.getByDisplayValue('5')).toBeInTheDocument();
  });

  it('saves the name, the rate and both switches', async () => {
    await open();
    fireEvent.change(screen.getByDisplayValue('5'), { target: { value: '12' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() =>
      expect(apiMock.updateGstSlab).toHaveBeenCalledWith('g5', {
        name: 'GST 5%',
        ratePct: 12,
        isDefault: false,
        isActive: true,
      }),
    );
  });

  it('can take one out of use without deleting it', async () => {
    await open();
    fireEvent.click(screen.getByText('Offered while punching'));
    fireEvent.click(screen.getByText('Save'));

    // Never deleted: lines already priced point at it.
    await waitFor(() => expect(apiMock.updateGstSlab.mock.calls[0][1].isActive).toBe(false));
  });

  it('promises that changing a rate does not rewrite what is already billed', async () => {
    await open();

    // The first thing anybody sensible worries about. Each line snapshots the
    // rate it was priced at, so it is true — and worth saying before they ask.
    expect(
      screen.getByText(/does not touch anything already quoted, ordered or invoiced/),
    ).toBeInTheDocument();
  });

  it('does not offer that promise when there is nothing yet to rewrite', async () => {
    await mount([]);
    fireEvent.click(screen.getByText('Add a rate'));

    expect(screen.queryByText(/already quoted, ordered or invoiced/)).toBeNull();
  });
});
