import { render, screen, fireEvent } from '@testing-library/react';
import { INK_DARK, INK_LIGHT, hexToHsl } from '@decor/shared';
import { ColorPicker } from './ColorPicker';

const onChange = jest.fn();

const mount = (value = '#2EA043') =>
  render(<ColorPicker value={value} onChange={onChange} />);

/** jsdom measures every box as zero, so the track needs a width of its own. */
function stubWidth(width = 200) {
  jest
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockReturnValue({ left: 0, width, top: 0, height: 26 } as DOMRect);
}

const track = (name: string) => screen.getByTestId(`colour-track-${name}`);

/** jsdom drops clientX off a synthetic pointer event, so build a real one. */
const pointerAt = (node: Element, clientX: number, type = 'pointerdown') =>
  fireEvent(node, new MouseEvent(type, { clientX, bubbles: true }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

it('shows the colour as it will actually appear', () => {
  mount('#D6F55B');
  expect(screen.getByTestId('colour-preview')).toHaveStyle({ background: '#D6F55B' });
});

it('writes the preview in the ink the product will use on it', () => {
  const { unmount } = mount('#D6F55B');
  // The question is not whether the colour is nice; it is whether the shop can
  // read its own labels on it.
  expect(screen.getByText('Sample stage')).toHaveStyle({ color: INK_DARK });
  unmount();
  mount('#8957E5');
  expect(screen.getByText('Sample stage')).toHaveStyle({ color: INK_LIGHT });
});

it('still offers the swatches, as somewhere to start', () => {
  mount();
  fireEvent.click(screen.getByLabelText('Colour #8957E5'));
  expect(onChange).toHaveBeenCalledWith('#8957E5');
});

it('marks the swatch that is currently chosen', () => {
  mount('#2EA043');
  expect(screen.getByLabelText('Colour #2EA043')).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByLabelText('Colour #DA3633')).toHaveAttribute('aria-pressed', 'false');
});

describe('the sliders', () => {
  it('reaches any hue on the wheel, not just the seven', () => {
    stubWidth();
    mount('#2EA043');
    pointerAt(track('hue'), 100);
    // Halfway along the track is halfway round the wheel.
    expect(hexToHsl(onChange.mock.calls.at(-1)![0]).h).toBe(180);
  });

  it('keeps the hue while the saturation is changed', () => {
    stubWidth();
    mount('#2EA043');
    pointerAt(track('saturation'), 200);
    const next = onChange.mock.calls.at(-1)![0];
    expect(hexToHsl(next).s).toBe(100);
    expect(hexToHsl(next).h).toBe(hexToHsl('#2EA043').h);
  });

  it('reaches white and black at the ends of the lightness', () => {
    stubWidth();
    mount('#2EA043');
    pointerAt(track('lightness'), 200);
    expect(onChange.mock.calls.at(-1)![0]).toBe('#FFFFFF');
    pointerAt(track('lightness'), 0);
    expect(onChange.mock.calls.at(-1)![0]).toBe('#000000');
  });

  it('only follows the pointer once it is down', () => {
    stubWidth();
    mount('#2EA043');
    pointerAt(track('hue'), 100, 'pointermove');
    // Otherwise the colour changes as the pointer merely crosses the track.
    expect(onChange).not.toHaveBeenCalled();
  });

  it('says what it is worth, for anything not looking at pixels', () => {
    mount('#FF0000');
    expect(track('hue')).toHaveAttribute('aria-valuenow', '0');
    expect(track('hue')).toHaveAttribute('aria-valuemax', '360');
  });

  it('can be moved a step at a time from the keyboard', () => {
    mount('#2EA043');
    fireEvent.keyDown(track('saturation'), { key: 'ArrowRight' });
    expect(hexToHsl(onChange.mock.calls.at(-1)![0]).s).toBe(
      hexToHsl('#2EA043').s + 1,
    );
  });

  it('ignores a key that is not a step', () => {
    mount('#2EA043');
    fireEvent.keyDown(track('hue'), { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('puts the thumb where the value is', () => {
    mount('#FF0000');
    // Red is hue zero, so the thumb sits at the very start.
    expect(screen.getByTestId('colour-thumb-hue')).toHaveStyle({ left: '0%' });
  });
});

describe('typing a hex straight in', () => {
  const hex = () =>
    Array.from(document.querySelectorAll('label.field'))
      .find((node) => node.querySelector('.field-label')?.textContent?.startsWith('Hex'))!
      .querySelector('input') as HTMLInputElement;

  it('takes a colour off a brand sheet', () => {
    mount();
    fireEvent.change(hex(), { target: { value: '#123456' } });
    expect(onChange).toHaveBeenCalledWith('#123456');
  });

  it('takes it without the hash, and in the short form', () => {
    mount();
    fireEvent.change(hex(), { target: { value: 'f80' } });
    expect(onChange).toHaveBeenCalledWith('#FF8800');
  });

  it('leaves half a hex alone while it is still being typed', () => {
    mount();
    fireEvent.change(hex(), { target: { value: '#12' } });
    // Rewriting the field under the typing makes it impossible to use.
    expect(onChange).not.toHaveBeenCalled();
    expect(hex()).toHaveValue('#12');
  });
});
