import { fireEvent, render, screen } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { INK_DARK, INK_LIGHT, hexToHsl } from '@fas/shared';
import { ColorPicker } from './ColorPicker';

const onChange = jest.fn();

async function mount(value = '#2EA043') {
  await render(
    <GestureHandlerRootView>
      <ColorPicker value={value} onChange={onChange} />
    </GestureHandlerRootView>,
  );
}

/** Give a track a width; jest measures every box as zero on its own. */
const measure = async (track: string, width = 200) =>
  fireEvent(screen.getByTestId(`colour-track-${track}`), 'layout', {
    nativeEvent: { layout: { width, height: 26, x: 0, y: 0 } },
  });

beforeEach(() => jest.clearAllMocks());

it('shows the colour as it will actually appear', async () => {
  await mount('#D6F55B');
  const style = Object.assign(
    {},
    ...[screen.getByTestId('colour-preview').props.style].flat(Infinity).filter(Boolean),
  );
  expect(style.backgroundColor).toBe('#D6F55B');
});

it('writes the preview in the ink the product will use on it', async () => {
  await mount('#D6F55B');
  // The question is not whether the colour is nice; it is whether the shop can
  // read its own labels on it.
  const inkOf = (node: { props: Record<string, unknown> }) =>
    Object.assign({}, ...[node.props.style].flat(Infinity).filter(Boolean)).color;
  expect(inkOf(screen.getByText('Sample stage'))).toBe(INK_DARK);
  await mount('#8957E5');
  expect(inkOf(screen.getAllByText('Sample stage').at(-1)!)).toBe(INK_LIGHT);
});

it('still offers the swatches, as somewhere to start', async () => {
  await mount();
  await fireEvent.press(screen.getByTestId('preset-#8957E5'));
  expect(onChange).toHaveBeenCalledWith('#8957E5');
});

it('marks the swatch that is currently chosen', async () => {
  await mount('#2EA043');
  expect(screen.getByTestId('preset-#2EA043').props.accessibilityState).toEqual({
    selected: true,
  });
  expect(screen.getByTestId('preset-#DA3633').props.accessibilityState).toEqual({
    selected: false,
  });
});

describe('the sliders', () => {
  const drag = (track: string, x: number) =>
    fireGestureHandler(getByGestureTestId(`colour-${track}`), [
      { state: 2, x },
      { state: 4, x },
      { x },
      { state: 5, x },
    ]);

  it('reaches any hue on the wheel, not just the seven', async () => {
    await mount('#2EA043');
    await measure('hue');
    drag('hue', 100);
    // Halfway along the track is halfway round the wheel.
    expect(hexToHsl(onChange.mock.calls.at(-1)![0]).h).toBe(180);
  });

  it('keeps the hue while the saturation is changed', async () => {
    await mount('#2EA043');
    await measure('saturation');
    drag('saturation', 200);
    const next = onChange.mock.calls.at(-1)![0];
    expect(hexToHsl(next).s).toBe(100);
    expect(hexToHsl(next).h).toBe(hexToHsl('#2EA043').h);
  });

  it('reaches white and black at the ends of the lightness', async () => {
    await mount('#2EA043');
    await measure('lightness');
    drag('lightness', 200);
    expect(onChange.mock.calls.at(-1)![0]).toBe('#FFFFFF');
    drag('lightness', 0);
    expect(onChange.mock.calls.at(-1)![0]).toBe('#000000');
  });

  it('says nothing until it has been measured', async () => {
    await mount();
    // Without a width every drag would read as position zero.
    drag('hue', 100);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not report the same value twice as a finger settles', async () => {
    await mount('#00FFFF');
    await measure('hue');
    // Cyan is already hue 180, which is where the middle of the track lands.
    drag('hue', 100);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('puts the thumb where the value is', async () => {
    await mount('#FF0000');
    await measure('hue', 360);
    const style = Object.assign(
      {},
      ...[screen.getByTestId('colour-thumb-hue').props.style].flat(Infinity).filter(Boolean),
    );
    // Red is hue zero, so the thumb sits at the very start.
    expect(style.left).toBe(0);
  });
});

describe('typing a hex straight in', () => {
  it('takes a colour off a brand sheet', async () => {
    await mount();
    await fireEvent.changeText(screen.getByPlaceholderText('#2EA043'), '#123456');
    expect(onChange).toHaveBeenCalledWith('#123456');
  });

  it('takes it without the hash, and in the short form', async () => {
    await mount();
    await fireEvent.changeText(screen.getByPlaceholderText('#2EA043'), 'f80');
    expect(onChange).toHaveBeenCalledWith('#FF8800');
  });

  it('leaves half a hex alone while it is still being typed', async () => {
    await mount();
    await fireEvent.changeText(screen.getByPlaceholderText('#2EA043'), '#12');
    // Rewriting the field under the typing makes it impossible to use.
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('#2EA043').props.value).toBe('#12');
  });
});
