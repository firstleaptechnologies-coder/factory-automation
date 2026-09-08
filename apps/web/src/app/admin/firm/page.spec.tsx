import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FirmPage from './page';

const apiMock = {
  firmProfile: jest.fn(),
  saveFirmProfile: jest.fn(),
  uploadLetterhead: jest.fn(),
  clearLetterhead: jest.fn(),
};
jest.mock('@/lib/api', () => ({
  api: new Proxy(
    {},
    {
      get: (_t, key: string) => (...args: unknown[]) =>
        apiMock[key as keyof typeof apiMock](...args),
    },
  ),
}));

const setAccent = jest.fn();
jest.mock('@/lib/theme', () => ({ useTheme: () => ({ accent: '#FF6B1A', setAccent }) }));

jest.mock('@/components/Shell', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
  bankName: 'HDFC',
  bankAccountName: 'Decor Bucket',
  bankAccountNumber: '50200012345678',
  bankIfsc: 'HDFC0001234',
  bankBranch: 'Main',
  termsAndConditions: 'Fifty percent advance.',
  signatoryName: 'Authorized Signatory',
  themeAccent: '#FF6B1A',
  letterheadFileId: null,
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const field = (label: string) =>
  Array.from(document.querySelectorAll('label.field'))
    .find((node) => node.querySelector('.field-label')?.textContent?.startsWith(label))!
    .querySelector('input, textarea') as HTMLInputElement;

async function mount(profile: unknown = PROFILE) {
  apiMock.firmProfile.mockResolvedValue(profile);
  render(<FirmPage />);
  await screen.findByText('Firm details');
  // The form is copied out of the loaded profile in an effect.
  await waitFor(() => expect(document.querySelector('label.field input')).toBeTruthy());
}

beforeEach(() => {
  jest.clearAllMocks();
  apiMock.saveFirmProfile.mockResolvedValue({});
  apiMock.uploadLetterhead.mockResolvedValue({});
  apiMock.clearLetterhead.mockResolvedValue({});
});

it('says it is loading rather than showing an empty form', async () => {
  apiMock.firmProfile.mockReturnValue(new Promise(() => {}));
  render(<FirmPage />);
  expect(await screen.findByText('Loading your firm')).toBeInTheDocument();
});

it('fills the form from what is already saved', async () => {
  await mount();
  expect(field('Firm name')).toHaveValue('Decor Bucket');
  expect(field('GSTIN')).toHaveValue('08AAWFD7264P1ZC');
  expect(field('IFSC')).toHaveValue('HDFC0001234');
});

it('shows an empty form for a firm that has filled in nothing', async () => {
  await mount({ id: 'firm1', name: null, gstin: null, letterheadFileId: null });
  // Every field reads `?? ''`, so a null column must not reach an input.
  expect(field('Firm name')).toHaveValue('');
});

it('says where the bank details end up', async () => {
  await mount();
  expect(
    screen.getByText('Printed under the totals, so the client knows where to send money.'),
  ).toBeInTheDocument();
});

describe('saving', () => {
  it('sends what was edited', async () => {
    await mount();
    fireEvent.change(field('Firm name'), { target: { value: 'Decor Bucket LLP' } });
    fireEvent.click(screen.getByText('Save firm details'));
    await waitFor(() => expect(apiMock.saveFirmProfile).toHaveBeenCalled());
    expect(apiMock.saveFirmProfile.mock.calls[0][0].name).toBe('Decor Bucket LLP');
  });

  it('confirms on the button itself', async () => {
    await mount();
    fireEvent.click(screen.getByText('Save firm details'));
    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });

  it('re-reads the profile so the screen shows what the server kept', async () => {
    await mount();
    fireEvent.click(screen.getByText('Save firm details'));
    await waitFor(() => expect(apiMock.firmProfile).toHaveBeenCalledTimes(2));
  });

  it('shows the server’s refusal instead of claiming it saved', async () => {
    apiMock.saveFirmProfile.mockRejectedValue(new Error('property id should not exist'));
    await mount();
    fireEvent.click(screen.getByText('Save firm details'));
    expect(await screen.findByText('property id should not exist')).toBeInTheDocument();
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });
});

describe('the brand colour', () => {
  const swatch = (colour: string) => screen.getByLabelText(`Colour ${colour}`);

  it('marks the colour currently in use', async () => {
    await mount();
    expect(swatch('#FF6B1A')).toHaveAttribute('aria-pressed', 'true');
  });

  it('falls back to the running accent when the firm has never picked one', async () => {
    await mount({ ...PROFILE, themeAccent: null });
    expect(swatch('#FF6B1A')).toHaveAttribute('aria-pressed', 'true');
  });

  it('picks a colour from the swatches', async () => {
    await mount();
    fireEvent.click(swatch('#2F81F7'));
    expect(swatch('#2F81F7')).toHaveAttribute('aria-pressed', 'true');
    expect(swatch('#FF6B1A')).toHaveAttribute('aria-pressed', 'false');
  });

  it('reaches any colour at all, not just the swatches', async () => {
    await mount();
    // A shop's brand colour is whatever is on its brand sheet.
    expect(screen.getByTestId('colour-track-hue')).toBeInTheDocument();
    expect(screen.getByTestId('colour-track-saturation')).toBeInTheDocument();
    expect(screen.getByTestId('colour-track-lightness')).toBeInTheDocument();
  });

  it('accepts a hex code the swatches do not offer, upper-cased', async () => {
    await mount();
    fireEvent.change(field('Hex'), { target: { value: '#abcdef' } });
    expect(field('Hex')).toHaveValue('#ABCDEF');
  });

  describe('a colour nothing can be read on', () => {
    const unreadable = async () => {
      await mount();
      fireEvent.change(field('Hex'), { target: { value: '#7A7A7A' } });
    };

    it('says so rather than silently correcting it', async () => {
      await unreadable();
      // The shop chose it; the answer is theirs to accept.
      expect(screen.getByText('Labels will be hard to read on this')).toBeInTheDocument();
    });

    it('offers the nearest shade that works', async () => {
      await unreadable();
      fireEvent.click(screen.getByText(/^Use #/));
      expect(
        screen.queryByText('Labels will be hard to read on this'),
      ).not.toBeInTheDocument();
    });

    it('says nothing about a colour that is perfectly readable', async () => {
      await mount();
      expect(
        screen.queryByText('Labels will be hard to read on this'),
      ).not.toBeInTheDocument();
    });
  });

  it('repaints on save rather than at the next load', async () => {
    await mount();
    fireEvent.click(swatch('#2EA043'));
    fireEvent.click(screen.getByText('Save firm details'));
    // A colour you picked and cannot see is indistinguishable from one that
    // failed to save.
    await waitFor(() => expect(setAccent).toHaveBeenCalledWith('#2EA043'));
  });

  it('does not repaint when the save fails', async () => {
    apiMock.saveFirmProfile.mockRejectedValue(new Error('nope'));
    await mount();
    fireEvent.click(swatch('#2EA043'));
    fireEvent.click(screen.getByText('Save firm details'));
    await waitFor(() => expect(screen.getByText('nope')).toBeInTheDocument());
    expect(setAccent).not.toHaveBeenCalled();
  });

  it('explains why only one colour is configurable', async () => {
    await mount();
    expect(screen.getByText(/the greys are what make a panel look/)).toBeInTheDocument();
  });
});

describe('the letterhead', () => {
  it('says documents build their own header when there is none', async () => {
    await mount();
    expect(screen.getByText(/No letterhead yet/)).toBeInTheDocument();
    expect(screen.getByText('Upload')).toBeInTheDocument();
    expect(screen.queryByText('Remove')).not.toBeInTheDocument();
  });

  it('offers to replace or remove one that is set', async () => {
    await mount({ ...PROFILE, letterheadFileId: 'file1' });
    expect(screen.getByText(/A letterhead is set/)).toBeInTheDocument();
    expect(screen.getByText('Replace')).toBeInTheDocument();
    expect(screen.getByText('Remove')).toBeInTheDocument();
  });

  it('uploads the file that was chosen and re-reads the profile', async () => {
    await mount();
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'head.png', { type: 'image/png' })] },
    });
    await waitFor(() => expect(apiMock.uploadLetterhead).toHaveBeenCalled());
    expect(apiMock.uploadLetterhead.mock.calls[0][0]).toBeInstanceOf(FormData);
    await waitFor(() => expect(apiMock.firmProfile).toHaveBeenCalledTimes(2));
  });

  it('does nothing when the picker is dismissed', async () => {
    await mount();
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [] } });
    expect(apiMock.uploadLetterhead).not.toHaveBeenCalled();
  });

  it('takes images and PDFs, since most shops have one or the other', async () => {
    await mount();
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    expect(input.accept).toBe('image/*,application/pdf');
  });

  it('removes the one that is set', async () => {
    await mount({ ...PROFILE, letterheadFileId: 'file1' });
    fireEvent.click(screen.getByText('Remove'));
    await waitFor(() => expect(apiMock.clearLetterhead).toHaveBeenCalled());
    await waitFor(() => expect(apiMock.firmProfile).toHaveBeenCalledTimes(2));
  });
});
