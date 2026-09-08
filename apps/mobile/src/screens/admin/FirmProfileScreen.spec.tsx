import { Alert } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { FirmProfileScreen } from './FirmProfileScreen';

const mockFirmProfile = jest.fn();
const mockSaveFirmProfile = jest.fn();
const mockUploadLetterhead = jest.fn();
const mockClearLetterhead = jest.fn();
jest.mock('../../api/client', () => ({
  api: {
    firmProfile: (...a: unknown[]) => mockFirmProfile(...a),
    saveFirmProfile: (...a: unknown[]) => mockSaveFirmProfile(...a),
    uploadLetterhead: (...a: unknown[]) => mockUploadLetterhead(...a),
    clearLetterhead: (...a: unknown[]) => mockClearLetterhead(...a),
  },
}));

const mockSetAccent = jest.fn();
jest.mock('../../theming/ThemeProvider', () => ({
  useTheme: () => ({ accent: '#FF6B1A', setAccent: (...a: unknown[]) => mockSetAccent(...a) }),
}));

const PROFILE = {
  id: 'firm1',
  tenantId: 't1',
  name: 'Decor Bucket',
  gstin: '08AAWFD7264P1ZC',
  stateCode: '08',
  stateName: 'Rajasthan',
  phone: '9829012345',
  email: 'hello@decorbucket.app',
  address: 'Bhilwara',
  website: null,
  bankName: 'HDFC',
  bankAccountName: 'Decor Bucket',
  bankAccountNumber: '50200012345678',
  bankIfsc: 'HDFC0001234',
  bankBranch: 'Main',
  termsAndConditions: 'Fifty percent advance.',
  signatoryName: 'Authorized Signatory',
  themeAccent: '#FF6B1A',
  accentColor: null,
  logoFileId: null,
  letterheadFileId: null,
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const goBack = jest.fn();
const picker = launchImageLibrary as jest.Mock;

async function mount(profile: unknown = PROFILE) {
  mockFirmProfile.mockResolvedValue(profile);
  // The colour picker's sliders are gestures, which need the root view.
  await render(
    <GestureHandlerRootView>
      <FirmProfileScreen navigation={{ goBack }} />
    </GestureHandlerRootView>,
  );
  await screen.findByText('Firm details');
}

const save = () => fireEvent.press(screen.getByText('Save firm details'));

beforeEach(() => {
  jest.clearAllMocks();
  mockSaveFirmProfile.mockResolvedValue({});
  mockUploadLetterhead.mockResolvedValue({});
  mockClearLetterhead.mockResolvedValue({});
  mockSetAccent.mockResolvedValue(undefined);
  picker.mockResolvedValue({ assets: [] });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

it('says it is loading rather than showing an empty form', async () => {
  mockFirmProfile.mockReturnValue(new Promise(() => {}));
  await render(<FirmProfileScreen navigation={{ goBack }} />);
  expect(screen.getByText('Loading your firm')).toBeTruthy();
});

it('fills the form from what is already saved', async () => {
  await mount();
  // Twice: the firm's name, and the same name on the bank account.
  expect(screen.getAllByDisplayValue('Decor Bucket')).toHaveLength(2);
  expect(screen.getByDisplayValue('08AAWFD7264P1ZC')).toBeTruthy();
  expect(screen.getByDisplayValue('HDFC0001234')).toBeTruthy();
});

it('shows an empty form for a firm that has filled in nothing', async () => {
  await mount({ id: 'firm1', name: null, gstin: null, letterheadFileId: null });
  // Every field reads `?? ''`, so a null column must not reach a TextInput.
  expect(screen.getByText('Save firm details')).toBeTruthy();
});

it('explains why the state matters, because it changes the tax lines', async () => {
  await mount();
  expect(screen.getByText(/CGST and SGST or a single IGST/)).toBeTruthy();
});

describe('saving', () => {
  it('sends what was edited', async () => {
    await mount();
    await fireEvent.changeText(screen.getAllByDisplayValue('Decor Bucket')[0], 'Decor Bucket LLP');
    await save();
    await waitFor(() => expect(mockSaveFirmProfile).toHaveBeenCalled());
    expect(mockSaveFirmProfile.mock.calls[0][0].name).toBe('Decor Bucket LLP');
  });

  it('confirms that the details will be used on documents', async () => {
    await mount();
    await save();
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Saved',
        'Your estimates and bills will use these details.',
      ),
    );
  });

  it('reloads afterwards, so the screen shows what the server kept', async () => {
    await mount();
    await save();
    await waitFor(() => expect(mockFirmProfile).toHaveBeenCalledTimes(2));
  });

  it('shows the server’s refusal instead of claiming it saved', async () => {
    mockSaveFirmProfile.mockRejectedValue(new Error('property id should not exist'));
    await mount();
    await save();
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Could not save', 'property id should not exist'),
    );
    expect(mockFirmProfile).toHaveBeenCalledTimes(1);
  });
});

describe('the brand colour', () => {
  it('marks the colour currently in use', async () => {
    await mount();
    expect(screen.getByTestId('preset-#FF6B1A')).toBeTruthy();
  });

  it('falls back to the running accent when the firm has never picked one', async () => {
    await mount({ ...PROFILE, themeAccent: null });
    expect(screen.getByDisplayValue('#FF6B1A')).toBeTruthy();
  });

  it('picks a colour from the swatches', async () => {
    await mount();
    await fireEvent.press(screen.getByTestId('preset-#2F81F7'));
    expect(screen.getByTestId('preset-#2F81F7').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('preset-#FF6B1A').props.accessibilityState.selected).toBe(false);
  });

  it('reaches any colour at all, not just the swatches', async () => {
    await mount();
    // A shop's brand colour is whatever is on its brand sheet.
    expect(screen.getByTestId('colour-track-hue')).toBeTruthy();
    expect(screen.getByTestId('colour-track-saturation')).toBeTruthy();
    expect(screen.getByTestId('colour-track-lightness')).toBeTruthy();
  });

  it('accepts a hex code the swatches do not offer', async () => {
    await mount();
    await fireEvent.changeText(screen.getByPlaceholderText('#2EA043'), '#abcdef');
    expect(screen.getByDisplayValue('#ABCDEF')).toBeTruthy();
  });

  it('repaints the app on save rather than at the next launch', async () => {
    await mount();
    await fireEvent.press(screen.getByTestId('preset-#2EA043'));
    await save();
    // A colour you picked and cannot see is indistinguishable from one that
    // failed to save.
    await waitFor(() => expect(mockSetAccent).toHaveBeenCalledWith('#2EA043'));
  });

  it('does not repaint when a save fails', async () => {
    mockSaveFirmProfile.mockRejectedValue(new Error('nope'));
    await mount();
    await fireEvent.press(screen.getByTestId('preset-#2EA043'));
    await save();
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect(mockSetAccent).not.toHaveBeenCalled();
  });

  describe('a colour nothing can be read on', () => {
    const unreadable = async () => {
      await mount();
      await fireEvent.changeText(screen.getByPlaceholderText('#2EA043'), '#7A7A7A');
    };

    it('says so rather than silently correcting it', async () => {
      await unreadable();
      // The shop chose it; the answer is theirs to accept.
      expect(screen.getByText('Labels will be hard to read on this')).toBeTruthy();
    });

    it('offers the nearest shade that works', async () => {
      await unreadable();
      await fireEvent.press(screen.getByText(/^Use #/));
      expect(screen.queryByText('Labels will be hard to read on this')).toBeNull();
    });

    it('says nothing about a colour that is perfectly readable', async () => {
      await mount();
      expect(screen.queryByText('Labels will be hard to read on this')).toBeNull();
    });
  });
});

describe('the letterhead', () => {
  it('says documents build their own header when there is none', async () => {
    await mount();
    expect(screen.getByText(/No letterhead yet/)).toBeTruthy();
    expect(screen.getByText('Upload')).toBeTruthy();
    expect(screen.queryByText('Remove')).toBeNull();
  });

  it('offers to replace or remove one that is set', async () => {
    await mount({ ...PROFILE, letterheadFileId: 'file1' });
    expect(screen.getByText(/A letterhead is set/)).toBeTruthy();
    expect(screen.getByText('Replace')).toBeTruthy();
    expect(screen.getByText('Remove')).toBeTruthy();
  });

  it('uploads the picture that was chosen', async () => {
    picker.mockResolvedValue({
      assets: [{ uri: 'file:///head.png', fileName: 'head.png', type: 'image/png' }],
    });
    await mount();
    await fireEvent.press(screen.getByText('Upload'));
    await waitFor(() => expect(mockUploadLetterhead).toHaveBeenCalled());
    expect(mockUploadLetterhead.mock.calls[0][0]).toBeInstanceOf(FormData);
  });

  it('does nothing when the picker is dismissed', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Upload'));
    await waitFor(() => expect(picker).toHaveBeenCalled());
    expect(mockUploadLetterhead).not.toHaveBeenCalled();
  });

  it('names the file when the picker did not', async () => {
    picker.mockResolvedValue({ assets: [{ uri: 'file:///head.png' }] });
    await mount();
    await fireEvent.press(screen.getByText('Upload'));
    await waitFor(() => expect(mockUploadLetterhead).toHaveBeenCalled());
  });

  it('says why an upload failed', async () => {
    picker.mockResolvedValue({ assets: [{ uri: 'file:///head.png' }] });
    mockUploadLetterhead.mockRejectedValue(new Error('Too large'));
    await mount();
    await fireEvent.press(screen.getByText('Upload'));
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Could not upload', 'Too large'),
    );
  });

  it('removes the one that is set and reloads', async () => {
    await mount({ ...PROFILE, letterheadFileId: 'file1' });
    await fireEvent.press(screen.getByText('Remove'));
    await waitFor(() => expect(mockClearLetterhead).toHaveBeenCalled());
    await waitFor(() => expect(mockFirmProfile).toHaveBeenCalledTimes(2));
  });
});

it('goes back', async () => {
  await mount();
  await fireEvent.press(screen.getByLabelText('Back'));
  expect(goBack).toHaveBeenCalled();
});
