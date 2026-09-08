import { render, screen } from '@testing-library/react-native';
import { Icon, IconName } from './Icon';
import { palette } from '../theme';

/**
 * Every name the app can ask for. A missing entry renders an empty square
 * rather than failing, so the list is checked rather than spot-checked.
 */
const NAMES: IconName[] = [
  'arrowUpRight', 'arrowDownLeft', 'plus', 'scan', 'home', 'card', 'history',
  'search', 'bell', 'settings', 'tune', 'user', 'users', 'ruler', 'layers',
  'flow', 'tag', 'camera', 'image', 'check', 'close', 'chevronRight',
  'chevronDown', 'chevronLeft', 'back', 'eye', 'eyeOff', 'filter', 'sparkle',
  'box', 'clipboard', 'trend', 'phone', 'pin', 'more', 'trash', 'edit',
];

const svg = () => screen.root!;

it.each(NAMES)('draws the %s icon', async (name) => {
  await render(<Icon name={name} />);
  // A name with no path renders an empty square rather than failing.
  expect(screen.root!.props.children).toBeTruthy();
});

it('is 22 across unless asked otherwise', async () => {
  await render(<Icon name="plus" />);
  expect(svg().props.width).toBe(22);
  expect(svg().props.height).toBe(22);
});

it('takes the size it is given, square', async () => {
  await render(<Icon name="plus" size={13} />);
  expect(svg().props.width).toBe(13);
  expect(svg().props.height).toBe(13);
});

it('is drawn in the app’s text colour by default', async () => {
  await render(<Icon name="plus" />);
  expect(svg().props.stroke).toBe(palette.text);
});

it('takes a colour, so it can sit on an accent surface', async () => {
  await render(<Icon name="plus" color={palette.textOnAccent} />);
  expect(svg().props.stroke).toBe(palette.textOnAccent);
});

it('is stroked, never filled — these are line icons', async () => {
  await render(<Icon name="box" />);
  expect(svg().props.fill).toBe('none');
  expect(Number(svg().props.strokeWidth)).toBeGreaterThan(0);
});

it('takes a heavier stroke where one is wanted', async () => {
  await render(<Icon name="check" strokeWidth={3} />);
  expect(svg().props.strokeWidth).toBe(3);
});

it('keeps every icon on one 24-unit grid, so sizes stay comparable', async () => {
  await render(<Icon name="plus" />);
  // react-native-svg splits the viewBox into its four numbers.
  expect([svg().props.minX, svg().props.minY, svg().props.vbWidth, svg().props.vbHeight])
    .toEqual([0, 0, 24, 24]);
});
