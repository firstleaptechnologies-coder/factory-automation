import { render } from '@testing-library/react';
import { Icon, IconName } from './Icon';

const NAMES: IconName[] = [
  'arrowUpRight', 'plus', 'scan', 'home', 'card', 'search', 'settings', 'tune',
  'user', 'users', 'ruler', 'layers', 'flow', 'tag', 'image', 'check', 'close',
  'chevronRight', 'chevronDown', 'back', 'filter', 'box', 'clipboard', 'trend',
  'phone', 'pin', 'trash', 'edit',
];

const svgOf = (element: React.ReactElement) =>
  render(element).container.querySelector('svg')!;

it.each(NAMES)('%s draws something', (name) => {
  // A missing entry renders an empty box, which reads as a layout bug rather
  // than a missing icon.
  expect(svgOf(<Icon name={name} />).innerHTML.trim()).not.toBe('');
});

it('draws on the same 24-unit grid whatever the size', () => {
  const svg = svgOf(<Icon name="plus" size={40} />);
  expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
  expect(svg.getAttribute('width')).toBe('40');
  expect(svg.getAttribute('height')).toBe('40');
});

it('keeps the app’s stroke weight by default', () => {
  // On a soft-UI surface a heavier icon reads as a different product.
  expect(svgOf(<Icon name="plus" />).getAttribute('stroke-width')).toBe('1.8');
});

it('takes the surrounding text colour by default', () => {
  expect(svgOf(<Icon name="plus" />).getAttribute('stroke')).toBe('currentColor');
});

it('can be given a colour and a weight', () => {
  const svg = svgOf(<Icon name="plus" color="var(--accent)" strokeWidth={2.4} />);
  expect(svg.getAttribute('stroke')).toBe('var(--accent)');
  expect(svg.getAttribute('stroke-width')).toBe('2.4');
});

it('is hidden from screen readers — every icon has a label beside it', () => {
  expect(svgOf(<Icon name="plus" />).getAttribute('aria-hidden')).toBe('true');
});

it('does not shrink inside a flex row', () => {
  expect(svgOf(<Icon name="plus" />).style.flexShrink).toBe('0');
});
