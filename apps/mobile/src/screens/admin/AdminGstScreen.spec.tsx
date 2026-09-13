import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AdminGstScreen } from './AdminGstScreen';

const mockSlabs = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
jest.mock('../../api/client', () => ({
  api: {
    gstSlabs: (...a: unknown[]) => mockSlabs(...a),
    createGstSlab: (...a: unknown[]) => mockCreate(...a),
    updateGstSlab: (...a: unknown[]) => mockUpdate(...a),
  },
}));

const SLABS = [
  { id: 'g18', name: 'GST 18%', ratePct: '18', isDefault: true, isActive: true, sortOrder: 0 },
  { id: 'g5', name: 'GST 5%', ratePct: '5', isDefault: false, isActive: true, sortOrder: 1 },
  { id: 'g0', name: 'Exempt', ratePct: '0', isDefault: false, isActive: false, sortOrder: 2 },
];

const navigation = { goBack: jest.fn() };
const mount = async (slabs: unknown[] = SLABS) => {
  mockSlabs.mockResolvedValue(slabs);
  await render(<AdminGstScreen navigation={navigation} />);
  await screen.findByText('GST rates');
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCreate.mockResolvedValue({});
  mockUpdate.mockResolvedValue({});
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

it('lists every rate, including the ones switched off', async () => {
  await mount();

  // Switched off still has to be visible — it is how you switch it back on.
  expect(mockSlabs).toHaveBeenCalledWith(true);
  expect(screen.getByText('GST 18%')).toBeTruthy();
  expect(screen.getByText('Exempt')).toBeTruthy();
  expect(screen.getByText('Off')).toBeTruthy();
});

it('counts only the rates actually on offer', async () => {
  await mount();
  expect(screen.getByText('2 in use')).toBeTruthy();
});

it('says which one is used unless another is picked', async () => {
  await mount();
  expect(screen.getByText('Default')).toBeTruthy();
});

it('shows each rate as a percentage', async () => {
  await mount();
  expect(screen.getByText('18%')).toBeTruthy();
  expect(screen.getByText('5%')).toBeTruthy();
});

/*
 * The state that made this screen necessary. A workspace whose slabs were
 * never seeded had every order and quote priced at 0%, and a registered
 * dealer's bills went out with no tax on them — with nothing anywhere saying
 * so.
 */
describe('a shop with no rates at all', () => {
  it('says what that actually costs them', async () => {
    await mount([]);

    expect(screen.getByTestId('no-slabs')).toBeTruthy();
    expect(screen.getByText(/every order and quote is priced at 0%/)).toBeTruthy();
  });

  it('keeps that warning off a shop that has some', async () => {
    await mount();
    expect(screen.queryByTestId('no-slabs')).toBeNull();
  });
});

describe('adding one', () => {
  const open = async () => {
    await mount([]);
    await fireEvent.press(screen.getByText('Add a rate'));
  };

  it('will not add one without a name and a rate', async () => {
    await open();
    await fireEvent.press(screen.getByText('Add it'));
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('sends the rate as a number, not the string it comes back as', async () => {
    await open();
    await fireEvent.changeText(screen.getByPlaceholderText('GST 18%'), 'GST 12%');
    await fireEvent.changeText(screen.getByPlaceholderText('18'), '12');
    await fireEvent.press(screen.getByText('Add it'));

    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({ name: 'GST 12%', ratePct: 12, isDefault: false }),
    );
  });

  it('lets the new one be made the default', async () => {
    await open();
    await fireEvent.changeText(screen.getByPlaceholderText('GST 18%'), 'GST 18%');
    await fireEvent.changeText(screen.getByPlaceholderText('18'), '18');
    await fireEvent.press(screen.getByText('Use unless another is picked'));
    await fireEvent.press(screen.getByText('Add it'));

    await waitFor(() => expect(mockCreate.mock.calls[0][0].isDefault).toBe(true));
  });

  /*
   * Typing then immediately tapping a chip used to lose what was typed.
   *
   * Both handlers run before React re-renders, so the chip's spread of `form`
   * carried a `name` from an earlier render and wrote it back over the letters
   * since. "GST 18%" reached the server as "GS" — and the field on screen
   * still said "GST 18%", so nothing looked wrong until the list came back.
   */
  it('keeps what was typed when a chip is tapped in the same breath', async () => {
    await open();

    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('GST 18%'), 'GST 18%');
      fireEvent.changeText(screen.getByPlaceholderText('18'), '18');
      fireEvent.press(screen.getByText('Use unless another is picked'));
    });
    await fireEvent.press(screen.getByText('Add it'));

    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({
        name: 'GST 18%',
        ratePct: 18,
        isDefault: true,
      }),
    );
  });

  it('refuses a rate that is not a rate', async () => {
    await open();
    await fireEvent.changeText(screen.getByPlaceholderText('GST 18%'), 'Nonsense');
    await fireEvent.changeText(screen.getByPlaceholderText('18'), '900');
    await fireEvent.press(screen.getByText('Add it'));

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('says what the rate becomes on a bill', async () => {
    await open();
    expect(screen.getByText(/CGST and SGST at home, charged as IGST out of state/)).toBeTruthy();
  });

  it('shows the server’s refusal rather than losing what was typed', async () => {
    mockCreate.mockRejectedValue(new Error('A rate called GST 18% already exists'));
    await open();
    await fireEvent.changeText(screen.getByPlaceholderText('GST 18%'), 'GST 18%');
    await fireEvent.changeText(screen.getByPlaceholderText('18'), '18');
    await fireEvent.press(screen.getByText('Add it'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Could not save',
        'A rate called GST 18% already exists',
      ),
    );
  });
});

describe('changing one', () => {
  const open = async () => {
    await mount();
    await fireEvent.press(screen.getByText('GST 5%'));
  };

  it('opens with what is already there', async () => {
    await open();
    expect(screen.getByDisplayValue('GST 5%')).toBeTruthy();
    expect(screen.getByDisplayValue('5')).toBeTruthy();
  });

  it('saves the name, the rate and both switches', async () => {
    await open();
    await fireEvent.changeText(screen.getByDisplayValue('5'), '12');
    await fireEvent.press(screen.getByText('Save'));

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith('g5', {
        name: 'GST 5%',
        ratePct: 12,
        isDefault: false,
        isActive: true,
      }),
    );
  });

  it('can take one out of use without deleting it', async () => {
    await open();
    await fireEvent.press(screen.getByText('Offered while punching'));
    await fireEvent.press(screen.getByText('Save'));

    // Never deleted: lines already priced point at it.
    await waitFor(() => expect(mockUpdate.mock.calls[0][1].isActive).toBe(false));
  });

  it('promises that changing a rate does not rewrite what is already billed', async () => {
    await open();

    // The first thing anybody sensible worries about. Each line snapshots the
    // rate it was priced at, so it is true — and worth saying before they ask.
    expect(
      screen.getByText(/does not touch anything already quoted, ordered or invoiced/),
    ).toBeTruthy();
  });

  it('does not offer that promise when there is nothing yet to rewrite', async () => {
    await mount([]);
    await fireEvent.press(screen.getByText('Add a rate'));

    expect(screen.queryByText(/already quoted, ordered or invoiced/)).toBeNull();
  });
});

it('goes back', async () => {
  await mount();
  await fireEvent.press(screen.getByLabelText('Back'));
  expect(navigation.goBack).toHaveBeenCalled();
});
