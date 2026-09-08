import { Text as RNText, View } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Card } from './Card';
import { spacing } from '../theme';

/** The style actually laid on the view that holds the card's children. */
const contentStyle = () => {
  const parents: Record<string, unknown>[] = [];
  let node = screen.getByText('Inside').parent;
  while (node) {
    if (node.props?.style) parents.push(Object.assign({}, ...[node.props.style].flat(Infinity).filter(Boolean)));
    node = node.parent;
  }
  return parents;
};

const has = (key: string, value: unknown) =>
  contentStyle().some((s) => s[key] === value);

it('shows what it was given', async () => {
  await render(<Card><RNText>Inside</RNText></Card>);
  expect(screen.getByText('Inside')).toBeTruthy();
});

it('pads its contents by default', async () => {
  await render(<Card><RNText>Inside</RNText></Card>);
  expect(has('padding', spacing.lg)).toBe(true);
});

it('can be left unpadded, for a card that holds its own layout', async () => {
  await render(<Card padded={false}><RNText>Inside</RNText></Card>);
  expect(has('padding', spacing.lg)).toBe(false);
});

describe('the style a caller passes', () => {
  it('lays out the children rather than the shadow wrapper', async () => {
    await render(
      <Card style={{ flexDirection: 'row' }}>
        <RNText>Inside</RNText>
      </Card>,
    );
    // On the wrapper this would stack the card's contents instead of putting
    // them in a row — a neumorphic surface is three nested views.
    expect(has('flexDirection', 'row')).toBe(true);
  });

  it('keeps the card’s own position on the outside', async () => {
    await render(
      <Card style={{ marginBottom: 12, gap: 8 }}>
        <RNText>Inside</RNText>
      </Card>,
    );
    expect(has('marginBottom', 12)).toBe(true);
    expect(has('gap', 8)).toBe(true);
  });

  it('survives an array of styles', async () => {
    await render(
      <Card style={[{ marginTop: 4 }, { alignItems: 'center' }] as never}>
        <RNText>Inside</RNText>
      </Card>,
    );
    expect(has('marginTop', 4)).toBe(true);
    expect(has('alignItems', 'center')).toBe(true);
  });
});

describe('pressing', () => {
  it('is not pressable unless it was given something to do', async () => {
    await render(<Card><RNText>Inside</RNText></Card>);
    // Nothing in the tree above the text answers to a press.
    expect(contentStyle().some((s) => s.transform)).toBe(false);
  });

  it('runs what it was given', async () => {
    const onPress = jest.fn();
    await render(<Card onPress={onPress}><RNText>Inside</RNText></Card>);
    await fireEvent.press(screen.getByText('Inside'));
    expect(onPress).toHaveBeenCalled();
  });

  it('sinks while it is held and comes back when it is let go', async () => {
    const onPress = jest.fn();
    await render(<Card onPress={onPress}><RNText>Inside</RNText></Card>);
    const scale = () =>
      contentStyle().map((s) => (s.transform as { scale: number }[] | undefined)?.[0]?.scale)
        .find((value) => value !== undefined);
    expect(scale()).toBe(1);
    await fireEvent(screen.getByText('Inside'), 'pressIn');
    expect(scale()).toBeLessThan(1);
    await fireEvent(screen.getByText('Inside'), 'pressOut');
    expect(scale()).toBe(1);
  });
});

it.each(['accent', 'dark', 'raised', 'inset'] as const)('renders the %s tone', async (tone) => {
  await render(<Card tone={tone}><View><RNText>Inside</RNText></View></Card>);
  expect(screen.getByText('Inside')).toBeTruthy();
});
