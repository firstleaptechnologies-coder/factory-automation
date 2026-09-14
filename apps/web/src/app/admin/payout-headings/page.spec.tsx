import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PayoutHeadingsPage from './page';

jest.mock('@/components/Shell', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const apiMock = {
  disbursementCategories: jest.fn(),
  createDisbursementCategory: jest.fn(),
  updateDisbursementCategory: jest.fn(),
};
jest.mock('@/lib/api', () => ({
  api: new Proxy(
    {},
    {
      get: (_t, key: string) => (...args: unknown[]) =>
        apiMock[key as keyof typeof apiMock](...(args as [never])),
    },
  ),
}));

const HEADINGS = [
  { id: 'h1', code: 'FITTING', name: 'Fitting', isActive: true, sortOrder: 0 },
  { id: 'h2', code: 'TRANSPORT', name: 'Transport', isActive: true, sortOrder: 1 },
  { id: 'h3', code: 'OLD', name: 'Old heading', isActive: false, sortOrder: 2 },
];

async function mount(rows: unknown[] = HEADINGS) {
  apiMock.disbursementCategories.mockResolvedValue(rows);
  render(<PayoutHeadingsPage />);
  await screen.findByText('Payout headings');
}

beforeEach(() => {
  jest.clearAllMocks();
  apiMock.createDisbursementCategory.mockResolvedValue({});
  apiMock.updateDisbursementCategory.mockResolvedValue({});
});

it('lists every heading, including the ones out of use', async () => {
  await mount();

  // Out of use still has to show — it is how one comes back.
  expect(apiMock.disbursementCategories).toHaveBeenCalledWith(true);
  expect(await screen.findByText('Fitting')).toBeInTheDocument();
  expect(screen.getByText('Old heading')).toBeInTheDocument();
  expect(screen.getByText('Not offered')).toBeInTheDocument();
});

it('counts only the ones actually on offer', async () => {
  await mount();
  expect(await screen.findByText('2 in use')).toBeInTheDocument();
});

/*
 * The state that made this page necessary. A workspace that was never seeded
 * any headings had an empty "What for?" on every payout and a ledger reading
 * Uncategorised, with nothing anywhere to fix it.
 */
describe('a shop with no headings at all', () => {
  it('says what that costs the ledger', async () => {
    await mount([]);

    expect(await screen.findByTestId('no-headings')).toBeInTheDocument();
    expect(screen.getByText(/every payout is filed as Uncategorised/)).toBeInTheDocument();
  });

  it('keeps that warning off a shop that has some', async () => {
    await mount();
    await screen.findByText('Fitting');
    expect(screen.queryByTestId('no-headings')).toBeNull();
  });
});

describe('adding one', () => {
  const open = async () => {
    await mount([]);
    fireEvent.click(screen.getByText('Add a heading'));
  };

  it('needs both a code and a name', async () => {
    await open();
    fireEvent.change(screen.getByPlaceholderText('FITTING'), { target: { value: 'POLISH' } });
    expect(screen.getByText('Add it').closest('button')).toBeDisabled();
  });

  it('upper-cases the code, which the ledger files against', async () => {
    await open();
    fireEvent.change(screen.getByPlaceholderText('FITTING'), { target: { value: 'polish' } });
    fireEvent.change(screen.getByPlaceholderText('Fitting'), { target: { value: 'Polishing' } });
    fireEvent.click(screen.getByText('Add it'));

    await waitFor(() =>
      expect(apiMock.createDisbursementCategory).toHaveBeenCalledWith({
        code: 'POLISH',
        name: 'Polishing',
      }),
    );
  });

  it('shows the server’s refusal rather than losing what was typed', async () => {
    apiMock.createDisbursementCategory.mockRejectedValue(new Error('FITTING already exists'));
    await open();
    fireEvent.change(screen.getByPlaceholderText('FITTING'), { target: { value: 'FITTING' } });
    fireEvent.change(screen.getByPlaceholderText('Fitting'), { target: { value: 'Fitting' } });
    fireEvent.click(screen.getByText('Add it'));

    expect(await screen.findByText('FITTING already exists')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Fitting')).toBeInTheDocument();
  });
});

describe('changing one', () => {
  const open = async (name = 'Fitting') => {
    await mount();
    fireEvent.click(await screen.findByText(name));
  };

  it('renames it, which was impossible before', async () => {
    await open();
    fireEvent.change(screen.getByDisplayValue('Fitting'), {
      target: { value: 'Fitting & polish' },
    });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() =>
      expect(apiMock.updateDisbursementCategory).toHaveBeenCalledWith('h1', {
        name: 'Fitting & polish',
        isActive: true,
      }),
    );
  });

  it('leaves the code alone, because the ledger files against it', async () => {
    await open();
    expect(screen.queryByPlaceholderText('FITTING')).toBeNull();
  });

  it('takes one out of use without deleting it', async () => {
    await open();
    fireEvent.click(screen.getByText('Offered on a payout'));
    fireEvent.click(screen.getByText('Save'));

    // Never deleted: payouts already filed under it point here.
    await waitFor(() =>
      expect(apiMock.updateDisbursementCategory.mock.calls[0][1].isActive).toBe(false),
    );
  });

  /*
   * There was only a way to switch one off, so a heading taken out of use
   * could never come back.
   */
  it('brings one back into use', async () => {
    await open('Old heading');
    // The chip in the sheet, not the pill in the row behind it.
    fireEvent.click(screen.getByRole('button', { name: 'Not offered' }));
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() =>
      expect(apiMock.updateDisbursementCategory).toHaveBeenCalledWith('h3', {
        name: 'Old heading',
        isActive: true,
      }),
    );
  });

  it('says what taking one out of use does to what is already filed', async () => {
    await open();
    expect(
      screen.getByText(/Everything already filed under it keeps saying so/),
    ).toBeInTheDocument();
  });
});
