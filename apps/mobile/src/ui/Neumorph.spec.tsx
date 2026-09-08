import { Text as RNText } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccentSurface, Neumorph } from './Neumorph';
import { palette, radius as R } from '../theme';

const flatten = (style: unknown) =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean)) as Record<string, unknown>;

/** Every style in the chain from the text up to the root. */
const chain = () => {
  const out: Record<string, unknown>[] = [];
  let node = screen.getByText('Inside').parent;
  while (node) {
    if (node.props?.style) out.push(flatten(node.props.style));
    node = node.parent;
  }
  return out;
};

const has = (key: string, value: unknown) => chain().some((s) => s[key] === value);

describe('Neumorph', () => {
  it.each(['raised', 'inset', 'flat'] as const)('shows its children when %s', async (variant) => {
    await render(<Neumorph variant={variant}><RNText>Inside</RNText></Neumorph>);
    expect(screen.getByText('Inside')).toBeTruthy();
  });

  it('casts a shadow when raised', async () => {
    await render(<Neumorph><RNText>Inside</RNText></Neumorph>);
    expect(chain().some((s) => Number(s.shadowOpacity) > 0)).toBe(true);
  });

  it('gives a raised surface a fill of its own', async () => {
    await render(<Neumorph><RNText>Inside</RNText></Neumorph>);
    // iOS derives a shadow from the layer's own opaque backing, not from its
    // children; an empty layer falls back to the bounding rectangle.
    expect(has('backgroundColor', palette.surface)).toBe(true);
  });

  it('draws a well rather than an inner shadow, which does not exist here', async () => {
    await render(<Neumorph variant="inset"><RNText>Inside</RNText></Neumorph>);
    expect(has('overflow', 'hidden')).toBe(true);
    expect(chain().some((s) => Number(s.shadowOpacity) > 0)).toBe(false);
  });

  it('lays out its children with the content style, not the shadow wrapper', async () => {
    await render(
      <Neumorph contentStyle={{ flexDirection: 'row' }}><RNText>Inside</RNText></Neumorph>,
    );
    expect(has('flexDirection', 'row')).toBe(true);
  });

  describe('the corner radius', () => {
    const layout = (width: number, height: number) =>
      fireEvent(screen.getByText('Inside').parent!.parent!, 'layout', {
        nativeEvent: { layout: { width, height, x: 0, y: 0 } },
      });

    it('is what was asked for while nothing has been measured', async () => {
      await render(<Neumorph radius={24}><RNText>Inside</RNText></Neumorph>);
      expect(has('borderRadius', 24)).toBe(true);
    });

    it('never exceeds half the shorter side, so a short box is not a lozenge', async () => {
      await render(<Neumorph radius={24}><RNText>Inside</RNText></Neumorph>);
      await layout(200, 20);
      expect(has('borderRadius', 10)).toBe(true);
    });

    it('leaves a big box at the radius it was given', async () => {
      await render(<Neumorph radius={24}><RNText>Inside</RNText></Neumorph>);
      await layout(300, 200);
      expect(has('borderRadius', 24)).toBe(true);
    });
  });

  it('defaults to the extra-large radius', async () => {
    await render(<Neumorph><RNText>Inside</RNText></Neumorph>);
    expect(has('borderRadius', R.xl)).toBe(true);
  });
});

describe('AccentSurface', () => {
  it('shows its children', async () => {
    await render(<AccentSurface><RNText>Inside</RNText></AccentSurface>);
    expect(screen.getByText('Inside')).toBeTruthy();
  });

  it('glows in the accent colour, which a tenant can change', async () => {
    await render(<AccentSurface><RNText>Inside</RNText></AccentSurface>);
    expect(has('shadowColor', palette.accent)).toBe(true);
  });

  it('dims its glow while it is held', async () => {
    await render(<AccentSurface soft><RNText>Inside</RNText></AccentSurface>);
    const lit = chain().map((s) => s.shadowOpacity).filter((v) => v !== undefined);
    await render(<AccentSurface><RNText>Inside</RNText></AccentSurface>);
    const held = chain().map((s) => s.shadowOpacity).filter((v) => v !== undefined);
    expect(Number(lit[0])).toBeLessThan(Number(held[0]));
  });
});
