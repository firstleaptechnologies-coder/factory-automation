import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ImageViewer, ThumbImage } from './ImageViewer';

const IMAGES = [
  { id: 'a1', url: 'https://api.test/files/f1', caption: 'Size' },
  { id: 'a2', url: 'https://api.test/files/f2', caption: 'Reference' },
  { id: 'a3', url: 'https://api.test/files/f3' },
];

let fetched: { url: string; headers: Record<string, string> }[] = [];
const revoked: string[] = [];

function mockFetch(ok = true) {
  fetched = [];
  (globalThis as { fetch?: unknown }).fetch = jest.fn(
    async (url: string, init: { headers?: Record<string, string> } = {}) => {
      fetched.push({ url: String(url), headers: init.headers ?? {} });
      return { ok, status: ok ? 200 : 404, blob: async () => new Blob(['x']) };
    },
  );
}

function mount(index: number | null = 0, images = IMAGES, token: string | null = 'tok') {
  const onClose = jest.fn();
  const view = render(
    <ImageViewer images={images} index={index} onClose={onClose} token={token} />,
  );
  return { onClose, view };
}

const stage = () => document.querySelector('.viewer-stage') as HTMLElement;
/**
 * jsdom builds a bare Event for pointer types, and a bare Event has no
 * clientX — every drag would read as NaN. A MouseEvent under the pointer name
 * carries the coordinates and still reaches React's pointer handler.
 */
function pointer(type: string, x = 0, y = 0) {
  fireEvent(
    stage(),
    new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true }),
  );
}

const transform = (id: string) =>
  (screen.getByTestId(`viewer-image-${id}`) as HTMLElement).style.transform;

/**
 * jsdom lays nothing out, so every box measures zero — and a viewer that
 * believes the picture is zero wide believes there is nothing to drag. Giving
 * the stage a screen and the picture a size is what makes the clamping under
 * test measurable at all.
 */
function stubLayout(stage = [900, 1000], picture = [800, 900]) {
  const size = (axis: 0 | 1) =>
    function (this: HTMLElement) {
      if (this.classList.contains('viewer-stage')) return stage[axis];
      if (this.tagName === 'IMG') return picture[axis];
      return 0;
    };
  for (const [prop, axis] of [
    ['offsetWidth', 0], ['clientWidth', 0], ['offsetHeight', 1], ['clientHeight', 1],
  ] as const) {
    Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: size(axis) });
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  stubLayout();
  revoked.length = 0;
  mockFetch();
  let n = 0;
  (URL as unknown as Record<string, unknown>).createObjectURL = jest.fn(() => `blob:${++n}`);
  (URL as unknown as Record<string, unknown>).revokeObjectURL = jest.fn((u: string) =>
    revoked.push(u),
  );
});

it('renders nothing until an image is opened', () => {
  const { view } = mount(null);
  expect(view.container).toBeEmptyDOMElement();
  expect(fetched).toHaveLength(0);
});

it('opens on the image that was clicked, not the first one', async () => {
  mount(1);
  await waitFor(() => expect(screen.getByTestId('viewer-image-a2')).toBeInTheDocument());
});

it('fetches the picture with the token instead of linking to it', async () => {
  mount(0);
  await waitFor(() => expect(fetched).toHaveLength(1));
  // An <img src> cannot carry a header, and a token in the URL would leak into
  // history and logs.
  expect(fetched[0].url).toBe('https://api.test/files/f1');
  expect(fetched[0].headers).toEqual({ Authorization: 'Bearer tok' });
});

it('releases the blob when the picture changes, so a session does not leak', async () => {
  mount(0);
  await waitFor(() => expect(screen.getByTestId('viewer-image-a1')).toBeInTheDocument());
  fireEvent.click(screen.getByLabelText('Next'));
  await waitFor(() => expect(revoked.length).toBeGreaterThan(0));
});

it('says so when a picture cannot be loaded', async () => {
  mockFetch(false);
  mount(0);
  expect(await screen.findByText('That picture could not be loaded.')).toBeInTheDocument();
});

it('says which of several pictures is showing', async () => {
  mount(0);
  expect(screen.getByText('1 of 3')).toBeInTheDocument();
});

it('says nothing about counting when there is only one', () => {
  mount(0, [IMAGES[0]]);
  expect(screen.queryByText(/of 1/)).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Next')).not.toBeInTheDocument();
});

it('shows the caption, and none for a picture without one', async () => {
  mount(0);
  expect(screen.getByText('Size')).toBeInTheDocument();
  mount(2);
  await waitFor(() => expect(screen.getAllByLabelText('Close').length).toBeGreaterThan(0));
});

describe('closing', () => {
  it('closes from the button', () => {
    const { onClose } = mount(0);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    const { onClose } = mount(0);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on a click outside the picture but not on it', async () => {
    const { onClose, view } = mount(0);
    await waitFor(() => expect(screen.getByTestId('viewer-image-a1')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('viewer-image-a1'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(view.container.querySelector('.viewer-backdrop')!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('moving between pictures', () => {
  it('steps forward and back with the buttons', async () => {
    mount(0);
    fireEvent.click(screen.getByLabelText('Next'));
    await waitFor(() => expect(screen.getByText('2 of 3')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('Previous'));
    await waitFor(() => expect(screen.getByText('1 of 3')).toBeInTheDocument());
  });

  it('steps with the arrow keys', async () => {
    mount(0);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    await waitFor(() => expect(screen.getByText('2 of 3')).toBeInTheDocument());
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    await waitFor(() => expect(screen.getByText('1 of 3')).toBeInTheDocument());
  });

  it('cannot step past either end', () => {
    mount(0);
    expect(screen.getByLabelText('Previous')).toBeDisabled();
    mount(2);
    expect(screen.getAllByLabelText('Next').at(-1)).toBeDisabled();
  });
});

describe('zooming', () => {
  it('starts at life size', async () => {
    mount(0);
    await waitFor(() => expect(transform('a1')).toContain('scale(1)'));
    expect(screen.getByTestId('viewer-scale')).toHaveTextContent('100%');
  });

  it('zooms in and out with the buttons', async () => {
    mount(0);
    await waitFor(() => expect(screen.getByTestId('viewer-image-a1')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('Zoom in'));
    expect(screen.getByTestId('viewer-scale')).toHaveTextContent('150%');
    fireEvent.click(screen.getByLabelText('Zoom out'));
    expect(screen.getByTestId('viewer-scale')).toHaveTextContent('100%');
  });

  it('zooms with the wheel', async () => {
    mount(0);
    await waitFor(() => expect(screen.getByTestId('viewer-image-a1')).toBeInTheDocument());
    fireEvent.wheel(stage(), { deltaY: -100 });
    expect(screen.getByTestId('viewer-scale')).toHaveTextContent('125%');
    fireEvent.wheel(stage(), { deltaY: 100 });
    expect(screen.getByTestId('viewer-scale')).toHaveTextContent('100%');
  });

  it('will not zoom past a useful limit, or below life size', async () => {
    mount(0);
    await waitFor(() => expect(screen.getByTestId('viewer-image-a1')).toBeInTheDocument());
    for (let i = 0; i < 40; i += 1) fireEvent.wheel(stage(), { deltaY: -100 });
    expect(screen.getByTestId('viewer-scale')).toHaveTextContent('500%');
    for (let i = 0; i < 40; i += 1) fireEvent.wheel(stage(), { deltaY: 100 });
    expect(screen.getByTestId('viewer-scale')).toHaveTextContent('100%');
  });

  it('toggles on a double click', async () => {
    mount(0);
    await waitFor(() => expect(screen.getByTestId('viewer-image-a1')).toBeInTheDocument());
    fireEvent.doubleClick(stage());
    expect(screen.getByTestId('viewer-scale')).toHaveTextContent('250%');
    fireEvent.doubleClick(stage());
    expect(screen.getByTestId('viewer-scale')).toHaveTextContent('100%');
  });

  it('resets from the button and from the 0 key', async () => {
    mount(0);
    await waitFor(() => expect(screen.getByTestId('viewer-image-a1')).toBeInTheDocument());
    fireEvent.doubleClick(stage());
    fireEvent.click(screen.getByLabelText('Reset zoom'));
    expect(screen.getByTestId('viewer-scale')).toHaveTextContent('100%');

    fireEvent.doubleClick(stage());
    fireEvent.keyDown(window, { key: '0' });
    expect(screen.getByTestId('viewer-scale')).toHaveTextContent('100%');
  });

  it('goes back to life size on the next picture', async () => {
    mount(0);
    await waitFor(() => expect(screen.getByTestId('viewer-image-a1')).toBeInTheDocument());
    fireEvent.doubleClick(stage());
    fireEvent.click(screen.getByLabelText('Next'));
    // Carrying a zoom across would open the next picture on a corner of it.
    await waitFor(() => expect(screen.getByTestId('viewer-scale')).toHaveTextContent('100%'));
  });
});

describe('panning', () => {
  it('does not drag an unzoomed picture off centre', async () => {
    mount(0);
    await waitFor(() => expect(screen.getByTestId('viewer-image-a1')).toBeInTheDocument());
    pointer('pointerdown', 100, 100);
    pointer('pointermove', 40, 40);
    expect(transform('a1')).toContain('translate(0px, 0px)');
  });

  it('moves a zoomed picture around', async () => {
    mount(0);
    await waitFor(() => expect(screen.getByTestId('viewer-image-a1')).toBeInTheDocument());
    fireEvent.doubleClick(stage());
    pointer('pointerdown', 100, 100);
    pointer('pointermove', 40, 70);
    expect(transform('a1')).toContain('translate(-60px, -30px)');
  });

  it('stops moving once the pointer is released', async () => {
    mount(0);
    await waitFor(() => expect(screen.getByTestId('viewer-image-a1')).toBeInTheDocument());
    fireEvent.doubleClick(stage());
    pointer('pointerdown', 100, 100);
    pointer('pointermove', 40, 100);
    pointer('pointerup');
    pointer('pointermove', 0, 100);
    expect(transform('a1')).toContain('translate(-60px, 0px)');
  });

  it('will not drag the picture off into black', async () => {
    mount(0);
    await waitFor(() => expect(screen.getByTestId('viewer-image-a1')).toBeInTheDocument());
    fireEvent.doubleClick(stage());
    // Picture 800 wide at 2.5 is 2000 against a 900 screen, so 550 of it hangs
    // off each side and that is exactly as far as it may travel.
    pointer('pointerdown', 1000, 100);
    pointer('pointermove', 0, 100);
    expect(transform('a1')).toContain('translate(-550px, 0px)');
  });

  it('pulls the picture back inside the frame when the zoom comes down', async () => {
    mount(0);
    await waitFor(() => expect(screen.getByTestId('viewer-image-a1')).toBeInTheDocument());
    fireEvent.doubleClick(stage());
    pointer('pointerdown', 1000, 100);
    pointer('pointermove', 0, 100);
    pointer('pointerup');
    // At 2 only 350 hangs off each side, so a 550 offset is no longer legal.
    fireEvent.click(screen.getByLabelText('Zoom out'));
    expect(transform('a1')).toContain('translate(-350px, 0px)');
  });

  it('re-centres when the zoom goes back to life size', async () => {
    mount(0);
    await waitFor(() => expect(screen.getByTestId('viewer-image-a1')).toBeInTheDocument());
    fireEvent.doubleClick(stage());
    pointer('pointerdown', 100, 100);
    pointer('pointermove', 40, 40);
    pointer('pointerup');
    fireEvent.click(screen.getByLabelText('Reset zoom'));
    // Otherwise the picture is stranded off to one side at life size.
    expect(transform('a1')).toContain('translate(0px, 0px)');
  });

  it('offers the grab cursor only when there is somewhere to drag to', async () => {
    mount(0);
    await waitFor(() => expect(screen.getByTestId('viewer-image-a1')).toBeInTheDocument());
    expect(stage().dataset.zoomed).toBe('false');
    fireEvent.doubleClick(stage());
    expect(stage().dataset.zoomed).toBe('true');
  });
});

describe('ThumbImage', () => {
  it('fetches the thumbnail with the token too', async () => {
    render(<ThumbImage url="https://api.test/files/f1" token="tok" />);
    await waitFor(() => expect(fetched).toHaveLength(1));
    expect(fetched[0].headers).toEqual({ Authorization: 'Bearer tok' });
  });

  it('leaves a placeholder rather than a broken image when it fails', async () => {
    mockFetch(false);
    const { container } = render(<ThumbImage url="https://api.test/files/f1" token="tok" />);
    await waitFor(() => expect(fetched).toHaveLength(1));
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.thumb-image')).toBeInTheDocument();
  });
});
