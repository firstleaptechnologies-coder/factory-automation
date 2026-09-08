import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PhotoField } from './PhotoField';

const optimizeImage = jest.fn();
jest.mock('@/lib/optimize-image', () => ({
  optimizeImage: (...args: unknown[]) => optimizeImage(...args),
}));

const revoked: string[] = [];

function fileOf(name: string, size: number): File {
  const file = new File(['x'], name, { type: 'image/jpeg' });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

function mount(photos: unknown[] = [], props: Record<string, unknown> = {}) {
  const onChange = jest.fn();
  const view = render(
    <PhotoField
      label="Reference photos"
      purpose="REFERENCE_IMAGE"
      photos={photos as never}
      onChange={onChange}
      {...props}
    />,
  );
  return { onChange, view, input: view.container.querySelector('input[type=file]')! };
}

beforeEach(() => {
  jest.clearAllMocks();
  revoked.length = 0;
  let n = 0;
  (URL as unknown as Record<string, unknown>).createObjectURL = jest.fn(() => `blob:${++n}`);
  (URL as unknown as Record<string, unknown>).revokeObjectURL = jest.fn((url: string) =>
    revoked.push(url),
  );
  optimizeImage.mockImplementation(async (file: File) => {
    const out = new File(['x'], file.name.replace(/\.\w+$/, '.webp'), { type: 'image/webp' });
    Object.defineProperty(out, 'size', { value: 200_000 });
    return out;
  });
});

it('renders the label and the hint', () => {
  mount([], { hint: 'What the client pointed at' });
  expect(screen.getByText('Reference photos')).toBeInTheDocument();
  expect(screen.getByText('What the client pointed at')).toBeInTheDocument();
});

it('optimises what was chosen before anything is queued', async () => {
  const { onChange, input } = mount();
  fireEvent.change(input, { target: { files: [fileOf('IMG_1.jpg', 9_000_000)] } });
  await waitFor(() => expect(onChange).toHaveBeenCalled());
  // What the user sees queued is what will actually be sent.
  expect(optimizeImage).toHaveBeenCalledWith(expect.any(File), 'REFERENCE_IMAGE');
  const [queued] = onChange.mock.calls[0][0];
  expect(queued.file.type).toBe('image/webp');
  expect(queued.originalSize).toBe(9_000_000);
});

it('adds to what is already queued', async () => {
  const existing = { file: fileOf('a.webp', 1), previewUrl: 'blob:old', originalSize: 2 };
  const { onChange, input } = mount([existing]);
  fireEvent.change(input, { target: { files: [fileOf('b.jpg', 900_000)] } });
  await waitFor(() => expect(onChange).toHaveBeenCalled());
  expect(onChange.mock.calls[0][0]).toHaveLength(2);
  expect(onChange.mock.calls[0][0][0]).toBe(existing);
});

it('replaces the one photo when only one is allowed', async () => {
  const existing = { file: fileOf('a.webp', 1), previewUrl: 'blob:old', originalSize: 2 };
  const { onChange, input } = mount([existing], { multiple: false });
  fireEvent.change(input, {
    target: { files: [fileOf('b.jpg', 900_000), fileOf('c.jpg', 900_000)] },
  });
  await waitFor(() => expect(onChange).toHaveBeenCalled());
  expect(onChange.mock.calls[0][0]).toHaveLength(1);
});

it('does nothing when the picker was dismissed', async () => {
  const { onChange, input } = mount();
  fireEvent.change(input, { target: { files: [] } });
  expect(onChange).not.toHaveBeenCalled();
  expect(optimizeImage).not.toHaveBeenCalled();
});

it('accepts a drop', async () => {
  const { onChange, view } = mount();
  const zone = view.container.querySelector('.dropzone')!;
  fireEvent.drop(zone, { dataTransfer: { files: [fileOf('a.jpg', 900_000)] } });
  await waitFor(() => expect(onChange).toHaveBeenCalled());
});

it('highlights the zone while a file is over it', () => {
  const { view } = mount();
  const zone = view.container.querySelector('.dropzone')!;
  fireEvent.dragOver(zone);
  expect(zone).toHaveClass('dragging');
  fireEvent.dragLeave(zone);
  expect(zone).not.toHaveClass('dragging');
});

it('stops highlighting once the file is dropped', async () => {
  const { view } = mount();
  const zone = view.container.querySelector('.dropzone')!;
  fireEvent.dragOver(zone);
  fireEvent.drop(zone, { dataTransfer: { files: [fileOf('a.jpg', 900_000)] } });
  await waitFor(() => expect(zone).not.toHaveClass('dragging'));
});

it('shows the saving on each queued photo', () => {
  const photo = { file: fileOf('a.webp', 200_000), previewUrl: 'blob:1', originalSize: 9_000_000 };
  mount([photo]);
  // On mobile data this is the difference between an upload that completes and
  // one the person gives up on.
  expect(screen.getByText(/→/)).toBeInTheDocument();
});

it('releases the preview when a photo is removed', () => {
  const photo = { file: fileOf('a.webp', 1), previewUrl: 'blob:1', originalSize: 2 };
  const { onChange } = mount([photo]);
  fireEvent.click(screen.getByText('×'));
  expect(revoked).toEqual(['blob:1']);
  expect(onChange).toHaveBeenCalledWith([]);
});

it('removes only the photo that was clicked', () => {
  const photos = [
    { file: fileOf('a.webp', 1), previewUrl: 'blob:1', originalSize: 2 },
    { file: fileOf('b.webp', 1), previewUrl: 'blob:2', originalSize: 2 },
  ];
  const { onChange } = mount(photos);
  fireEvent.click(screen.getAllByText('×')[1]);
  expect(onChange).toHaveBeenCalledWith([photos[0]]);
});

it('says it is working while the files are being re-encoded', async () => {
  let release: (file: File) => void = () => {};
  optimizeImage.mockImplementation(() => new Promise<File>((r) => (release = r)));
  const { input } = mount();
  fireEvent.change(input, { target: { files: [fileOf('a.jpg', 900_000)] } });
  expect(await screen.findByText('Optimising…')).toBeInTheDocument();
  release(fileOf('a.webp', 100));
  await waitFor(() => expect(screen.queryByText('Optimising…')).not.toBeInTheDocument());
});
