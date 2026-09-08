import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { ImageViewer } from './ImageViewer';

const IMAGES = [
  { id: 'a1', uri: 'https://api.test/files/f1', headers: { Authorization: 'Bearer tok' }, caption: 'Size' },
  { id: 'a2', uri: 'https://api.test/files/f2', caption: 'Reference' },
  { id: 'a3', uri: 'https://api.test/files/f3' },
];

async function mount(index: number | null = 0, images = IMAGES) {
  const onClose = jest.fn();
  const view = await render(
    <GestureHandlerRootView>
      <ImageViewer images={images} index={index} onClose={onClose} />
    </GestureHandlerRootView>,
  );
  return { onClose, view };
}

/** Reads the transform the animated style produced for the open image. */
const transformOf = (id: string) => {
  const node = screen.getByTestId(`viewer-image-${id}`);
  const style = node.parent?.props?.style;
  const flat = Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style;
  return Object.assign({}, ...(flat?.transform ?? []));
};

const pinchTo = (id: string, scale: number) =>
  fireGestureHandler(getByGestureTestId(`viewer-pinch-${id}`), [{ scale }, { scale }]);

const drag = (id: string, translationX: number, translationY: number) =>
  fireGestureHandler(getByGestureTestId(`viewer-pan-${id}`), [
    { translationX: translationX / 2, translationY: translationY / 2 },
    { translationX, translationY },
  ]);

const doubleTap = (id: string) =>
  fireGestureHandler(getByGestureTestId(`viewer-double-tap-${id}`), [{}]);

it('shows nothing until an image is opened', async () => {
  await mount(null);
  expect(screen.queryByTestId('viewer-image-a1')).toBeNull();
});

it('opens on the image that was tapped, not the first one', async () => {
  await mount(1);
  expect(screen.getByTestId('viewer-image-a2')).toBeTruthy();
});

it('carries the bearer token, or the picture would 401', async () => {
  await mount(0);
  expect(screen.getByTestId('viewer-image-a1').props.source).toMatchObject({
    uri: 'https://api.test/files/f1',
    headers: { Authorization: 'Bearer tok' },
  });
});

it('fits the whole picture on screen rather than cropping it', async () => {
  await mount(0);
  // A measurement scribble cropped to fill is worse than useless.
  expect(screen.getByTestId('viewer-image-a1').props.resizeMode).toBe('contain');
});

it('says which of several pictures is showing', async () => {
  await mount(0);
  expect(screen.getByText('1 of 3')).toBeTruthy();
});

it('says nothing about counting when there is only one', async () => {
  await mount(0, [IMAGES[0]]);
  expect(screen.queryByText(/of 1/)).toBeNull();
});

it('shows the caption under the picture', async () => {
  await mount(0);
  expect(screen.getByText('Size')).toBeTruthy();
});

it('shows no caption bar for a picture without one', async () => {
  await mount(2);
  expect(screen.queryByText('Reference')).toBeNull();
});

it('closes from the button', async () => {
  const { onClose } = await mount(0);
  await fireEvent.press(screen.getByTestId('viewer-close'));
  expect(onClose).toHaveBeenCalled();
});

describe('zooming', () => {
  it('starts at life size', async () => {
    await mount(0);
    expect(transformOf('a1').scale).toBe(1);
  });

  it('zooms with a pinch', async () => {
    await mount(0);
    pinchTo('a1', 2);
    await waitFor(() => expect(transformOf('a1').scale).toBeCloseTo(2, 1));
  });

  it('will not zoom past a useful limit', async () => {
    await mount(0);
    pinchTo('a1', 40);
    // Past this the picture is a texture, not a document.
    await waitFor(() => expect(transformOf('a1').scale).toBe(5));
  });

  it('will not shrink below life size', async () => {
    await mount(0);
    pinchTo('a1', 0.2);
    await waitFor(() => expect(transformOf('a1').scale).toBe(1));
  });

  it('zooms in on a double tap', async () => {
    await mount(0);
    doubleTap('a1');
    await waitFor(() => expect(transformOf('a1').scale).toBeGreaterThan(1));
  });

  it('a second double tap puts it back', async () => {
    await mount(0);
    doubleTap('a1');
    await waitFor(() => expect(transformOf('a1').scale).toBeGreaterThan(1));
    doubleTap('a1');
    await waitFor(() => expect(transformOf('a1').scale).toBe(1));
  });
});

describe('panning', () => {
  it('moves a zoomed picture around', async () => {
    await mount(0);
    pinchTo('a1', 3);
    drag('a1', -80, -60);
    await waitFor(() => expect(transformOf('a1').translateX).toBe(-80));
    expect(transformOf('a1').translateY).toBe(-60);
  });

  it('cannot be dragged off the screen entirely', async () => {
    await mount(0);
    pinchTo('a1', 2);
    drag('a1', -5000, -5000);
    // Flung away, the viewer would show black and read as a failed load.
    const moved = transformOf('a1');
    expect(moved.translateX).toBeGreaterThan(-5000);
    expect(moved.translateY).toBeGreaterThan(-5000);
    expect(Number.isFinite(moved.translateX)).toBe(true);
  });

  it('pulls the picture back inside its edges when it is zoomed out again', async () => {
    await mount(0);
    pinchTo('a1', 5);
    drag('a1', -400, 0);
    await waitFor(() => expect(transformOf('a1').translateX).toBeLessThan(0));

    // Zooming most of the way back out leaves far less room to be off-centre,
    // so the picture is pulled in rather than left hanging past its own edge.
    pinchTo('a1', 0.25);
    await waitFor(() => expect(transformOf('a1').translateX).toBeGreaterThan(-200));
    expect(transformOf('a1').translateX).toBeLessThan(0);
  });

  it('keeps the position between drags, so it can be nudged', async () => {
    await mount(0);
    pinchTo('a1', 3);
    drag('a1', -80, 0);
    drag('a1', -40, 0);
    await waitFor(() => expect(transformOf('a1').translateX).toBe(-120));
  });

  it('does not strand an unzoomed picture off to one side', async () => {
    await mount(0);
    drag('a1', -80, 0);
    await waitFor(() => expect(transformOf('a1').translateX).toBe(0));
  });
});

describe('the gestures on an unzoomed picture', () => {
  it('a drag downward puts it away', async () => {
    const { onClose } = await mount(0);
    drag('a1', 0, 200);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('a small drag downward does not', async () => {
    const { onClose } = await mount(0);
    drag('a1', 0, 40);
    await waitFor(() => expect(onClose).not.toHaveBeenCalled());
  });

  it('a drag left moves to the next picture', async () => {
    await mount(0);
    drag('a1', -200, 0);
    await waitFor(() => expect(screen.getByText('2 of 3')).toBeTruthy());
  });

  it('a drag right moves back', async () => {
    await mount(1);
    drag('a2', 200, 0);
    await waitFor(() => expect(screen.getByText('1 of 3')).toBeTruthy());
  });

  it('does not run off the end of the set', async () => {
    await mount(2);
    drag('a3', -200, 0);
    await waitFor(() => expect(screen.getByText('3 of 3')).toBeTruthy());
  });

  it('does not run off the front of the set', async () => {
    await mount(0);
    drag('a1', 200, 0);
    await waitFor(() => expect(screen.getByText('1 of 3')).toBeTruthy());
  });

  it('a zoomed picture is dragged, not dismissed', async () => {
    const { onClose } = await mount(0);
    pinchTo('a1', 3);
    drag('a1', 0, 200);
    await waitFor(() => expect(transformOf('a1').translateY).toBe(200));
    expect(onClose).not.toHaveBeenCalled();
  });
});
