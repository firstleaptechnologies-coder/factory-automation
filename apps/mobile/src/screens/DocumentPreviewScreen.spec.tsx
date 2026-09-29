import { Alert } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { DocumentPreviewScreen } from './DocumentPreviewScreen';

const mockFetchText = jest.fn();
jest.mock('../api/client', () => ({
  api: { fetchText: (...a: unknown[]) => mockFetchText(...a) },
}));

const mockShareDocument = jest.fn();
jest.mock('../lib/documents', () => ({
  shareDocument: (...a: unknown[]) => mockShareDocument(...a),
}));

const goBack = jest.fn();

const PARAMS = {
  path: '/leads/ld1/document',
  title: 'Enquiry',
  subtitle: 'LEAD-1',
  fileName: 'LEAD-1',
  message: 'Enquiry LEAD-1 — ₹11,800',
  phone: '9820012345',
};

async function mount(params: Record<string, unknown> = PARAMS) {
  await render(<DocumentPreviewScreen route={{ params }} navigation={{ goBack }} />);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchText.mockResolvedValue('<!doctype html><html><body>LEAD-1</body></html>');
  mockShareDocument.mockResolvedValue(true);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

it('asks the server for the document, at the path it was given', async () => {
  await mount();
  await screen.findByTestId('document-webview');
  expect(mockFetchText).toHaveBeenCalledWith('/leads/ld1/document');
});

it('shows the server’s own markup, not a second layout of it', async () => {
  await mount();
  const web = await screen.findByTestId('document-webview');
  // The preview is only honest if it is the same HTML the PDF is made from.
  expect(web.props.source).toEqual({
    html: '<!doctype html><html><body>LEAD-1</body></html>',
  });
});

it('shares the same path it previewed, so what was read is what is sent', async () => {
  await mount();
  await screen.findByTestId('document-webview');
  await fireEvent.press(screen.getByText('Share as PDF'));
  expect(mockShareDocument).toHaveBeenCalledWith({
    path: '/leads/ld1/document',
    fileName: 'LEAD-1',
    message: 'Enquiry LEAD-1 — ₹11,800',
    phone: '9820012345',
  });
});

it('says so when the document could not be built, rather than showing a blank page', async () => {
  mockFetchText.mockRejectedValue(new Error('Renderer failed'));
  await mount();
  expect(await screen.findByText('Could not build it')).toBeTruthy();
  expect(screen.queryByTestId('document-webview')).toBeNull();
});

it('does not let the page reach out to the network for anything', async () => {
  await mount();
  const web = await screen.findByTestId('document-webview');
  // The letterhead is inlined as a data URI by the server, so there is
  // nothing to fetch — which is what makes this readable in a workshop.
  expect(web.props.source).not.toHaveProperty('uri');
});
