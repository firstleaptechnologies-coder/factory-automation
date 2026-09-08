import { render, screen, fireEvent } from '@testing-library/react';
import { Select } from './Select';

const OPTIONS = [
  { value: 'a', label: 'Cutting', color: '#FF6B1A' },
  { value: 'b', label: 'Polishing', description: 'After sanding' },
  { value: 'c', label: 'Delivered' },
];

function open(props: Partial<Parameters<typeof Select>[0]> = {}) {
  const onChange = jest.fn();
  const view = render(
    <Select label="Status" value={null} options={OPTIONS} onChange={onChange} {...props} />,
  );
  const trigger = view.container.querySelector('.select-trigger') as HTMLElement;
  return { onChange, trigger, view };
}

it('shows the placeholder until something is chosen', () => {
  open();
  expect(screen.getByText('Select…')).toBeInTheDocument();
});

it('shows the chosen option’s label', () => {
  open({ value: 'b' });
  expect(screen.getByText('Polishing')).toBeInTheDocument();
});

it('does not open until it is asked to', () => {
  open();
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

it('opens on a click and closes on a second', () => {
  const { trigger } = open();
  fireEvent.click(trigger);
  expect(screen.getByRole('listbox')).toBeInTheDocument();
  fireEvent.click(trigger);
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

it('reports the option that was clicked and closes', () => {
  const { onChange, trigger } = open();
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('option', { name: /Delivered/ }));
  expect(onChange).toHaveBeenCalledWith('c');
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

it('marks the current option for a screen reader', () => {
  const { trigger } = open({ value: 'b' });
  fireEvent.click(trigger);
  expect(screen.getByRole('option', { name: /Polishing/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

it('says whether it is open', () => {
  const { trigger } = open();
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(trigger);
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
});

it.each(['ArrowDown', 'Enter', ' '])('opens from the keyboard with %s', (key) => {
  const { trigger, view } = open();
  fireEvent.keyDown(trigger, { key });
  expect(view.container.querySelector('[role="listbox"]')).toBeInTheDocument();
});

it('moves the highlight with the arrows and commits with Enter', () => {
  const { onChange, trigger } = open();
  fireEvent.click(trigger);
  const list = screen.getByRole('listbox');
  fireEvent.keyDown(list, { key: 'ArrowDown' });
  fireEvent.keyDown(list, { key: 'Enter' });
  expect(onChange).toHaveBeenCalledWith('b');
});

it('starts the highlight on the current value, not at the top', () => {
  const { onChange, trigger } = open({ value: 'c' });
  fireEvent.click(trigger);
  fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Enter' });
  expect(onChange).toHaveBeenCalledWith('c');
});

it('does not run off either end of the list', () => {
  const { onChange, trigger } = open();
  fireEvent.click(trigger);
  const list = screen.getByRole('listbox');
  for (let i = 0; i < 10; i += 1) fireEvent.keyDown(list, { key: 'ArrowUp' });
  fireEvent.keyDown(list, { key: 'Enter' });
  expect(onChange).toHaveBeenCalledWith('a');
});

it('closes on Escape without changing anything', () => {
  const { onChange, trigger } = open({ value: 'a' });
  fireEvent.click(trigger);
  fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
});

it('closes when the page is clicked elsewhere', () => {
  const { trigger } = open();
  fireEvent.click(trigger);
  fireEvent.mouseDown(document.body);
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

it('cannot be opened while disabled', () => {
  const { trigger } = open({ disabled: true });
  fireEvent.click(trigger);
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

it('shows a status colour as a dot on the trigger and in the list', () => {
  const { trigger } = open({ value: 'a' });
  expect(document.querySelector('.select-dot')).toBeInTheDocument();
  fireEvent.click(trigger);
  expect(document.querySelectorAll('.select-dot').length).toBeGreaterThan(1);
});

it('shows an option’s description under its label', () => {
  const { trigger } = open();
  fireEvent.click(trigger);
  expect(screen.getByText('After sanding')).toBeInTheDocument();
});

it('renders a hint under the field', () => {
  render(
    <Select value={null} options={OPTIONS} onChange={() => {}} hint="Pick a stage" />,
  );
  expect(screen.getByText('Pick a stage')).toBeInTheDocument();
});
