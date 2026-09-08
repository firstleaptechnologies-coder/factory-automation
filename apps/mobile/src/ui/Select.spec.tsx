import { fireEvent, render, screen } from '@testing-library/react-native';
import { Select } from './Select';

const OPTIONS = [
  { value: 'a', label: 'Cutting', color: '#FF6B1A' },
  { value: 'b', label: 'Polishing', description: 'After sanding' },
  { value: 'c', label: 'Delivered' },
];

async function mount(props: Record<string, unknown> = {}) {
  const onChange = jest.fn();
  const view = await render(
    <Select label="Status" value={null} options={OPTIONS} onChange={onChange} {...props} />,
  );
  return { onChange, view };
}

const openSheet = () => fireEvent(screen.getByTestId('select-trigger'), 'touchEnd');


it('shows the placeholder until something is chosen', async () => {
  await mount();
  expect(screen.getByText('Select…')).toBeTruthy();
});

it('shows the chosen option', async () => {
  await mount({ value: 'b' });
  expect(screen.getAllByText('Polishing').length).toBeGreaterThan(0);
});

it('does not open until it is asked to', async () => {
  await mount();
  expect(screen.queryByText('After sanding')).toBeNull();
});

it('opens the sheet on a tap', async () => {
  await mount();
  await openSheet();
  expect(screen.getByText('After sanding')).toBeTruthy();
});

it('reports the option that was picked', async () => {
  const { onChange } = await mount();
  await openSheet();
  await fireEvent.press(screen.getByText('Delivered'));
  expect(onChange).toHaveBeenCalledWith('c');
});

it('closes once something is picked', async () => {
  await mount();
  await openSheet();
  await fireEvent.press(screen.getByText('Delivered'));
  expect(screen.queryByText('After sanding')).toBeNull();
});

it('cannot be opened while disabled', async () => {
  await mount({ disabled: true });
  await openSheet();
  expect(screen.queryByText('After sanding')).toBeNull();
});

it('heads the sheet with the field’s label', async () => {
  await mount();
  await openSheet();
  // Two "Status": the field label and the sheet heading.
  expect(screen.getAllByText('Status').length).toBe(2);
});

it('takes its own sheet heading when the field label is not the right words', async () => {
  await mount({ title: 'Move this order to' });
  await openSheet();
  expect(screen.getByText('Move this order to')).toBeTruthy();
});

it('shows a hint under the field', async () => {
  await mount({ hint: 'Only stages the flow allows' });
  expect(screen.getByText('Only stages the flow allows')).toBeTruthy();
});

it('shows a status colour as a dot', async () => {
  const { view } = await mount({ value: 'a' });
  expect(JSON.stringify(view.toJSON())).toContain('#FF6B1A');
});

it('gives a long list the taller sheet', async () => {
  const many = Array.from({ length: 9 }, (_, i) => ({ value: `v${i}`, label: `Option ${i}` }));
  await mount({ options: many });
  await openSheet();
  // Otherwise the last few options sit below the fold with nothing to say so.
  expect(JSON.stringify(screen.toJSON())).toContain('"height":"88%"');
});
