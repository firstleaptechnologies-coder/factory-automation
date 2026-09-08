import { Alert, Platform } from 'react-native';
import { generatePDF } from 'react-native-html-to-pdf';
import Share from 'react-native-share';
import { shareDocument } from './documents';

const mockFetchText = jest.fn();
jest.mock('../api/client', () => ({
  api: { fetchText: (path: string) => mockFetchText(path) },
}));
const fetchText = mockFetchText;

const generate = generatePDF as jest.Mock;
const share = Share as unknown as { open: jest.Mock; shareSingle: jest.Mock; Social: Record<string, string> };

const OPTIONS = { path: '/estimates/e1/document', fileName: 'EST-1', message: 'Your estimate' };

beforeEach(() => {
  jest.clearAllMocks();
  fetchText.mockResolvedValue('<html>estimate</html>');
  generate.mockResolvedValue({ filePath: '/tmp/EST-1.pdf' });
  share.Social.WHATSAPP = 'whatsapp';
  Platform.OS = 'ios';
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

it('renders the server’s own HTML, so paper and screen agree', async () => {
  await shareDocument(OPTIONS);
  expect(fetchText).toHaveBeenCalledWith('/estimates/e1/document');
  expect(generate.mock.calls[0][0].html).toBe('<html>estimate</html>');
});

it('builds an A4-shaped page and prints the backgrounds', async () => {
  await shareDocument(OPTIONS);
  const args = generate.mock.calls[0][0];
  expect(args).toMatchObject({ width: 595, height: 842, fileName: 'EST-1' });
  // Without this the coloured headers and the total bar print white.
  expect(args.shouldPrintBackgrounds).toBe(true);
});

it('reports a PDF that could not be built', async () => {
  generate.mockResolvedValue({ filePath: null });
  await expect(shareDocument(OPTIONS)).resolves.toBe(false);
  expect(Alert.alert).toHaveBeenCalledWith(
    'Could not build the PDF',
    expect.stringContaining('could not be rendered'),
  );
});

it('opens the share sheet when no number was given', async () => {
  await expect(shareDocument(OPTIONS)).resolves.toBe(true);
  expect(share.open).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'application/pdf', filename: 'EST-1', failOnCancel: false }),
  );
  expect(share.shareSingle).not.toHaveBeenCalled();
});

it('goes straight to WhatsApp when a number was given', async () => {
  await shareDocument({ ...OPTIONS, phone: '+91 98200 12345' });
  expect(share.shareSingle).toHaveBeenCalled();
  // WhatsApp wants the country code and no punctuation.
  expect(share.shareSingle.mock.calls[0][0].whatsAppNumber).toBe('919820012345');
  expect(share.open).not.toHaveBeenCalled();
});

it('prefixes the path with file:// on Android', async () => {
  Platform.OS = 'android';
  await shareDocument(OPTIONS);
  expect(share.open.mock.calls[0][0].url).toBe('file:///tmp/EST-1.pdf');
});

it('leaves the path alone on iOS', async () => {
  await shareDocument(OPTIONS);
  expect(share.open.mock.calls[0][0].url).toBe('/tmp/EST-1.pdf');
});

it('treats a dismissed share sheet as nothing to report', async () => {
  share.open.mockRejectedValue(new Error('User did not share (cancelled)'));
  await expect(shareDocument(OPTIONS)).resolves.toBe(false);
  expect(Alert.alert).not.toHaveBeenCalled();
});

it('reports a real sharing failure', async () => {
  share.open.mockRejectedValue(new Error('No app can open this'));
  await expect(shareDocument(OPTIONS)).resolves.toBe(false);
  expect(Alert.alert).toHaveBeenCalledWith('Could not share', 'No app can open this');
});

it('lets a failure fetching the document surface to the caller', async () => {
  fetchText.mockRejectedValue(new Error('Estimate e1 not found'));
  await expect(shareDocument(OPTIONS)).rejects.toThrow('Estimate e1 not found');
});
