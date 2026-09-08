import { Alert } from 'react-native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { OrderPhotosScreen } from './OrderPhotosScreen';

const mockAddAttachments = jest.fn();
jest.mock('../api/client', () => ({
  api: {
    addAttachmentsNative: (...a: unknown[]) => mockAddAttachments(...a),
    fileUrl: (id: string) => `https://api.test/files/${id}`,
    getToken: () => 'tok',
  },
}));

const camera = launchCamera as jest.Mock;
const library = launchImageLibrary as jest.Mock;

const ASSET = { uri: 'file:///tmp/a.jpg', type: 'image/jpeg', fileName: 'a.jpg' };

const goBack = jest.fn();

/** The button counts what is queued, so its label moves: "Upload" → "Upload 1". */
const uploadButton = () => screen.getByText(/^Upload/);

async function mount() {
  await render(
    <OrderPhotosScreen route={{ params: { orderId: 'o1' } }} navigation={{ goBack }} />,
  );
  await screen.findByText('Add photos');
}

beforeEach(() => {
  jest.clearAllMocks();
  camera.mockResolvedValue({ assets: [ASSET] });
  library.mockResolvedValue({ assets: [ASSET] });
  mockAddAttachments.mockResolvedValue([]);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

it('offers the camera and the library', async () => {
  await mount();
  expect(screen.getByText('Camera')).toBeTruthy();
  expect(screen.getByText('Library')).toBeTruthy();
});

it('takes one photo from the camera and several from the library', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Camera'));
  await waitFor(() => expect(camera).toHaveBeenCalled());
  expect(camera.mock.calls[0][0].selectionLimit).toBe(1);

  await fireEvent.press(screen.getByText('Library'));
  await waitFor(() => expect(library).toHaveBeenCalled());
  expect(library.mock.calls[0][0].selectionLimit).toBe(5);
});

it('asks the picker to shrink the photo before it ever reaches us', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Camera'));
  await waitFor(() => expect(camera).toHaveBeenCalled());
  const options = camera.mock.calls[0][0];
  // A 12 MP original crossing shop wifi is the thing worth avoiding.
  expect(options.maxWidth).toBeGreaterThan(0);
  expect(options.includeBase64).toBe(false);
});

it('says nothing when the picker was simply dismissed', async () => {
  camera.mockResolvedValue({ didCancel: true });
  await mount();
  await fireEvent.press(screen.getByText('Camera'));
  await waitFor(() => expect(camera).toHaveBeenCalled());
  expect(Alert.alert).not.toHaveBeenCalled();
});

it('explains a missing camera', async () => {
  camera.mockResolvedValue({ errorCode: 'camera_unavailable' });
  await mount();
  await fireEvent.press(screen.getByText('Camera'));
  await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('No camera', expect.anything()));
});

it('explains a refused permission, and where to fix it', async () => {
  camera.mockResolvedValue({ errorCode: 'permission' });
  await mount();
  await fireEvent.press(screen.getByText('Camera'));
  await waitFor(() =>
    expect(Alert.alert).toHaveBeenCalledWith(
      'Permission needed',
      expect.stringContaining('Settings'),
    ),
  );
});

it('will not upload nothing', async () => {
  await mount();
  await fireEvent.press(uploadButton());
  expect(mockAddAttachments).not.toHaveBeenCalled();
});

it('uploads a size photo without demanding a description', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Camera'));
  await waitFor(() => expect(camera).toHaveBeenCalled());
  await fireEvent.press(uploadButton());
  await waitFor(() => expect(mockAddAttachments).toHaveBeenCalled());
  expect(mockAddAttachments.mock.calls[0][2]).toMatchObject({
    kind: 'SIZE_IMAGE',
    description: undefined,
  });
});

it('demands a description on a reference image, before sending anything', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Camera'));
  await waitFor(() => expect(camera).toHaveBeenCalled());
  await fireEvent.press(screen.getByText('Reference'));
  await fireEvent.press(uploadButton());
  // What is the client pointing at in it?
  await waitFor(() =>
    expect(Alert.alert).toHaveBeenCalledWith('Description needed', expect.anything()),
  );
  expect(mockAddAttachments).not.toHaveBeenCalled();
});

it('sends the description once it is given', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Camera'));
  await waitFor(() => expect(camera).toHaveBeenCalled());
  await fireEvent.press(screen.getByText('Reference'));
  await fireEvent.changeText(
    screen.getByPlaceholderText('What is the client pointing at?'),
    ' the corner detail ',
  );
  await fireEvent.press(uploadButton());
  await waitFor(() => expect(mockAddAttachments).toHaveBeenCalled());
  expect(mockAddAttachments.mock.calls[0][2]).toMatchObject({
    kind: 'REFERENCE_IMAGE',
    description: 'the corner detail',
  });
});

it('streams the file from disk rather than reading it into memory', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Camera'));
  await waitFor(() => expect(camera).toHaveBeenCalled());
  await fireEvent.press(uploadButton());
  await waitFor(() => expect(mockAddAttachments).toHaveBeenCalled());
  expect(mockAddAttachments.mock.calls[0][1][0]).toEqual({
    uri: 'file:///tmp/a.jpg',
    type: 'image/jpeg',
    name: 'a.jpg',
  });
});

it('names a file the picker did not name', async () => {
  camera.mockResolvedValue({ assets: [{ uri: 'file:///tmp/x', type: null, fileName: null }] });
  await mount();
  await fireEvent.press(screen.getByText('Camera'));
  await waitFor(() => expect(camera).toHaveBeenCalled());
  await fireEvent.press(uploadButton());
  await waitFor(() => expect(mockAddAttachments).toHaveBeenCalled());
  expect(mockAddAttachments.mock.calls[0][1][0]).toMatchObject({
    type: 'image/jpeg',
    name: 'photo-0.jpg',
  });
});

it('goes back once the photos are on the order', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Camera'));
  await waitFor(() => expect(camera).toHaveBeenCalled());
  await fireEvent.press(uploadButton());
  await waitFor(() => expect(goBack).toHaveBeenCalled());
});

it('shows the server’s refusal and keeps the queued photos', async () => {
  mockAddAttachments.mockRejectedValue(new Error('is over the 40 MB upload limit'));
  await mount();
  await fireEvent.press(screen.getByText('Camera'));
  await waitFor(() => expect(camera).toHaveBeenCalled());
  await fireEvent.press(uploadButton());
  await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
  expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe('Upload failed');
  expect(goBack).not.toHaveBeenCalled();
});

it('drops a photo from the queue', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Camera'));
  await waitFor(() => expect(camera).toHaveBeenCalled());
  await fireEvent.press(screen.getByText('Remove'));
  await fireEvent.press(uploadButton());
  expect(mockAddAttachments).not.toHaveBeenCalled();
});
