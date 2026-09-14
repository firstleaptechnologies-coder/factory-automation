import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AdminPayoutHeadingsScreen } from './AdminPayoutHeadingsScreen';

const mockList = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
jest.mock('../../api/client', () => ({
  api: {
    disbursementCategories: (...a: unknown[]) => mockList(...a),
    createDisbursementCategory: (...a: unknown[]) => mockCreate(...a),
    updateDisbursementCategory: (...a: unknown[]) => mockUpdate(...a),
  },
}));

const HEADINGS = [
  { id: 'h1', code: 'FITTING', name: 'Fitting', isActive: true, sortOrder: 0 },
  { id: 'h2', code: 'TRANSPORT', name: 'Transport', isActive: true, sortOrder: 1 },
  { id: 'h3', code: 'OLD', name: 'Old heading', isActive: false, sortOrder: 2 },
];

const navigation = { goBack: jest.fn() };
const mount = async (rows: unknown[] = HEADINGS) => {
  mockList.mockResolvedValue(rows);
  await render(<AdminPayoutHeadingsScreen navigation={navigation} />);
  await screen.findByText('Payout headings');
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCreate.mockResolvedValue({});
  mockUpdate.mockResolvedValue({});
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

it('lists every heading, including the ones out of use', async () => {
  await mount();

  // Out of use still has to show — it is how one comes back.
  expect(mockList).toHaveBeenCalledWith(true);
  expect(screen.getByText('Fitting')).toBeTruthy();
  expect(screen.getByText('Old heading')).toBeTruthy();
  expect(screen.getByText('Not offered')).toBeTruthy();
});

it('counts only the ones actually on offer', async () => {
  await mount();
  expect(screen.getByText('2 in use')).toBeTruthy();
});

/*
 * The state that made this screen necessary. A workspace that was never seeded
 * any headings had an empty "What for?" on every payout and a ledger reading
 * Uncategorised, with nothing anywhere to fix it.
 */
describe('a shop with no headings at all', () => {
  it('says what that costs the ledger', async () => {
    await mount([]);

    expect(screen.getByTestId('no-headings')).toBeTruthy();
    expect(screen.getByText(/every payout is filed as Uncategorised/)).toBeTruthy();
  });

  it('keeps that warning off a shop that has some', async () => {
    await mount();
    expect(screen.queryByTestId('no-headings')).toBeNull();
  });
});

describe('adding one', () => {
  const open = async () => {
    await mount([]);
    await fireEvent.press(screen.getByText('Add a heading'));
  };

  it('needs both a code and a name', async () => {
    await open();
    await fireEvent.changeText(screen.getByPlaceholderText('FITTING'), 'POLISH');
    await fireEvent.press(screen.getByText('Add it'));
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('upper-cases the code, which the ledger files against', async () => {
    await open();
    await fireEvent.changeText(screen.getByPlaceholderText('FITTING'), 'polish');
    await fireEvent.changeText(screen.getByPlaceholderText('Fitting'), 'Polishing');
    await fireEvent.press(screen.getByText('Add it'));

    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({ code: 'POLISH', name: 'Polishing' }),
    );
  });

  it('shows the server’s refusal rather than losing what was typed', async () => {
    mockCreate.mockRejectedValue(new Error('FITTING already exists'));
    await open();
    await fireEvent.changeText(screen.getByPlaceholderText('FITTING'), 'FITTING');
    await fireEvent.changeText(screen.getByPlaceholderText('Fitting'), 'Fitting');
    await fireEvent.press(screen.getByText('Add it'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Could not save', 'FITTING already exists'),
    );
  });
});

describe('changing one', () => {
  const open = async (name = 'Fitting') => {
    await mount();
    await fireEvent.press(screen.getByText(name));
  };

  it('renames it, which was impossible before', async () => {
    await open();
    await fireEvent.changeText(screen.getByDisplayValue('Fitting'), 'Fitting & polish');
    await fireEvent.press(screen.getByText('Save'));

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith('h1', {
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
    await fireEvent.press(screen.getByTestId('toggle-offered'));
    await fireEvent.press(screen.getByText('Save'));

    // Never deleted: payouts already filed under it point here.
    await waitFor(() => expect(mockUpdate.mock.calls[0][1].isActive).toBe(false));
  });

  /*
   * There was only a way to switch one off, so a heading taken out of use
   * could never come back.
   */
  it('brings one back into use', async () => {
    await open('Old heading');
    await fireEvent.press(screen.getByTestId('toggle-offered'));
    await fireEvent.press(screen.getByText('Save'));

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith('h3', { name: 'Old heading', isActive: true }),
    );
  });

  it('says what taking one out of use does to what is already filed', async () => {
    await open();
    expect(screen.getByText(/Everything already filed under it keeps saying so/)).toBeTruthy();
  });
});

it('goes back', async () => {
  await mount();
  await fireEvent.press(screen.getByLabelText('Back'));
  expect(navigation.goBack).toHaveBeenCalled();
});
