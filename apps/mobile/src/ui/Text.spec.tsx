import { render, screen } from '@testing-library/react-native';
import { Text } from './Text';
import { palette, font, weight } from '../theme';

const style = (label: string) =>
  Object.assign({}, ...[screen.getByText(label).props.style].flat(Infinity).filter(Boolean));

it('reads as body text unless told otherwise', async () => {
  await render(<Text>Punched</Text>);
  expect(style('Punched').fontSize).toBe(font.body);
});

it.each([
  ['display', font.display],
  ['h1', font.h1],
  ['h2', font.h2],
  ['h3', font.h3],
  ['small', font.small],
  ['tiny', font.tiny],
  ['micro', font.micro],
] as const)('sizes %s type', async (variant, size) => {
  await render(<Text variant={variant}>Punched</Text>);
  expect(style('Punched').fontSize).toBe(size);
});

it('sets section labels in tracked upper case', async () => {
  await render(<Text variant="label">Money</Text>);
  expect(style('Money').textTransform).toBe('uppercase');
  expect(style('Money').letterSpacing).toBeGreaterThan(0);
});

it.each([
  ['muted', palette.textMuted],
  ['faint', palette.textFaint],
  ['danger', palette.danger],
  ['success', palette.success],
  ['warning', palette.warning],
] as const)('paints the %s tone', async (tone, colour) => {
  await render(<Text tone={tone}>Punched</Text>);
  expect(style('Punched').color).toBe(colour);
});

it('takes the accent from the running theme, not from when the module loaded', async () => {
  await render(<Text tone="accent">Punched</Text>);
  // A tenant changes its accent at runtime; StyleSheet.create would have
  // frozen whatever the colour was at import.
  expect(style('Punched').color).toBe(palette.accent);
});

it('takes the on-accent colour the same way', async () => {
  await render(<Text tone="onAccent">Punched</Text>);
  expect(style('Punched').color).toBe(palette.textOnAccent);
});

it('can be made bold at any size', async () => {
  await render(<Text variant="tiny" bold>Punched</Text>);
  expect(style('Punched').fontWeight).toBe(weight.bold);
});

it('lets a caller override the style it computed', async () => {
  await render(<Text style={{ color: '#123456' }}>Punched</Text>);
  expect(style('Punched').color).toBe('#123456');
});

it('passes the rest through, so lines can still be clamped', async () => {
  await render(<Text numberOfLines={2}>Punched</Text>);
  expect(screen.getByText('Punched').props.numberOfLines).toBe(2);
});
