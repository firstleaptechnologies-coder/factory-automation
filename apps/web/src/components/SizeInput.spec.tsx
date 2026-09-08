import { render, screen, fireEvent } from '@testing-library/react';
import { SizeInput } from './SizeInput';

function mount(value: string, unit = 'FT', withUnit = true) {
  const onChange = jest.fn();
  const onUnitChange = jest.fn();
  const view = render(
    <SizeInput
      label="Length"
      value={value}
      unit={unit as never}
      onChange={onChange}
      onUnitChange={withUnit ? onUnitChange : undefined}
    />,
  );
  return { onChange, onUnitChange, view, input: view.container.querySelector('input')! };
}

it('shows what will actually be stored', () => {
  mount('8');
  // No doubt about what is being saved.
  expect(screen.getByText(/= 2438.4 mm stored/)).toBeInTheDocument();
});

it('reads a bare number in the chosen unit', () => {
  mount('1000', 'MM');
  expect(screen.getByText(/= 1000 mm stored/)).toBeInTheDocument();
});

it('understands a feet-and-inches measurement whatever the unit is set to', () => {
  mount('8\' 6"', 'MM');
  // The shop measures in whatever the tape says.
  expect(screen.getByText(/mm stored/).textContent).toMatch(/2590/);
});

it('understands a unit typed into the box', () => {
  mount('2440mm', 'FT');
  expect(screen.getByText(/= 2440 mm stored/)).toBeInTheDocument();
});

it('understands a fraction', () => {
  mount('3/4in', 'FT');
  expect(screen.getByText(/= 19.05 mm stored/)).toBeInTheDocument();
});

it('says plainly when it cannot read a size', () => {
  mount('about yay big');
  expect(screen.getByText('Not a size I can read')).toBeInTheDocument();
});

it('marks an unreadable size on the box itself', () => {
  const { input } = mount('nonsense');
  expect(input.style.borderColor).toBe('var(--danger)');
});

it('says nothing at all while the box is empty', () => {
  const { view } = mount('');
  expect(view.container.textContent).not.toMatch(/Not a size/);
  expect(view.container.textContent).not.toMatch(/stored/);
});

it('reports what was typed', () => {
  const { onChange, input } = mount('');
  fireEvent.change(input, { target: { value: '8' } });
  expect(onChange).toHaveBeenCalledWith('8');
});

it('offers the units to switch between', () => {
  const { view } = mount('8');
  fireEvent.click(view.container.querySelector('.select-trigger')!);
  expect(screen.getAllByRole('option').length).toBeGreaterThan(1);
});

it('reports a unit change', () => {
  const { onUnitChange, view } = mount('8');
  fireEvent.click(view.container.querySelector('.select-trigger')!);
  fireEvent.click(screen.getByRole('option', { name: /Millimetres|mm/i }));
  expect(onUnitChange).toHaveBeenCalled();
});

it('hides the unit picker when the caller fixes the unit', () => {
  const { view } = mount('8', 'FT', false);
  expect(view.container.querySelector('.select-trigger')).toBeNull();
});

it('suggests the format people actually type', () => {
  const { input } = mount('');
  expect(input.getAttribute('placeholder')).toContain("8' 6\"");
});
