import { fireEvent, render, screen } from '@testing-library/react-native';
import { FilterSheet } from './FilterSheet';

const DIMENSIONS = [
  {
    key: 'materialId',
    label: 'Material',
    options: [
      { id: null, label: 'Any material' },
      { id: 'm1', label: 'MDF' },
    ],
  },
  {
    key: 'statusId',
    label: 'Stage',
    options: [
      { id: null, label: 'Any stage' },
      { id: 's1', label: 'Cutting' },
    ],
  },
];

async function mount(value: Record<string, string | null> = {}, visible = true) {
  const onApply = jest.fn();
  const onClose = jest.fn();
  const view = await render(
    <FilterSheet
      visible={visible}
      onClose={onClose}
      dimensions={DIMENSIONS}
      value={value}
      onApply={onApply}
    />,
  );
  return { onApply, onClose, view };
}

const tapRow = (label: string) => fireEvent(screen.getByText(label), 'touchEnd');

it('offers a wheel per dimension', async () => {
  await mount();
  expect(screen.getByText('Material')).toBeTruthy();
  expect(screen.getByText('Stage')).toBeTruthy();
});

it('says nothing is filtered yet', async () => {
  await mount();
  expect(screen.getByText('Nothing filtered yet')).toBeTruthy();
  expect(screen.getByText('Show everything')).toBeTruthy();
});

it('counts the filters already applied, in the singular', async () => {
  await mount({ materialId: 'm1' });
  expect(screen.getByText('1 filter ready to apply')).toBeTruthy();
  expect(screen.getByText('Apply 1 filter')).toBeTruthy();
});

it('counts them in the plural', async () => {
  await mount({ materialId: 'm1', statusId: 's1' });
  expect(screen.getByText('2 filters ready to apply')).toBeTruthy();
  expect(screen.getByText('Apply 2 filters')).toBeTruthy();
});

it('does not filter anything until Apply is pressed', async () => {
  const { onApply } = await mount();
  await tapRow('MDF');
  // Otherwise the list thrashes and re-fetches while somebody is still deciding.
  expect(onApply).not.toHaveBeenCalled();
});

it('applies every wheel together and closes', async () => {
  const { onApply, onClose } = await mount();
  await tapRow('MDF');
  await tapRow('Cutting');
  await fireEvent.press(screen.getByText('Apply 2 filters'));
  expect(onApply).toHaveBeenCalledWith({ materialId: 'm1', statusId: 's1' });
  expect(onClose).toHaveBeenCalled();
});

it('applies the empty set when nothing was chosen', async () => {
  const { onApply } = await mount();
  await fireEvent.press(screen.getByText('Show everything'));
  expect(onApply).toHaveBeenCalledWith({});
});

it('offers Clear all only when something is set', async () => {
  await mount();
  expect(screen.queryByText('Clear all')).toBeNull();
});

it('clears every dimension in one go and applies immediately', async () => {
  const { onApply, onClose } = await mount({ materialId: 'm1', statusId: 's1' });
  await fireEvent.press(screen.getByText('Clear all'));
  expect(onApply).toHaveBeenCalledWith({ materialId: null, statusId: null });
  expect(onClose).toHaveBeenCalled();
});

it('shows what is actually applied when reopened, not what was abandoned', async () => {
  const onApply = jest.fn();
  const props = {
    dimensions: DIMENSIONS,
    value: { materialId: 'm1' },
    onApply,
    onClose: () => {},
  };
  const view = await render(<FilterSheet visible {...props} />);
  await tapRow('Cutting');
  expect(screen.getByText('2 filters ready to apply')).toBeTruthy();

  await view.rerender(<FilterSheet visible={false} {...props} />);
  await view.rerender(<FilterSheet visible {...props} />);
  expect(screen.getByText('1 filter ready to apply')).toBeTruthy();
});

it('keeps what has been spun when the list behind it re-renders', async () => {
  const onApply = jest.fn();
  const dimensions = DIMENSIONS;
  const view = await render(
    <FilterSheet
      visible
      dimensions={dimensions}
      value={{ materialId: null, statusId: null }}
      onApply={onApply}
      onClose={() => {}}
    />,
  );
  await tapRow('Cutting');
  expect(screen.getByText('1 filter ready to apply')).toBeTruthy();

  /*
   * Every caller passes `value` as an object literal, so an equal one arrives
   * with a new identity whenever the screen behind the sheet re-renders. That
   * used to put the applied filters back over the draft; the wheel scrolled
   * itself to match, re-rendered, and the two flickered against each other.
   */
  await view.rerender(
    <FilterSheet
      visible
      dimensions={dimensions}
      value={{ materialId: null, statusId: null }}
      onApply={onApply}
      onClose={() => {}}
    />,
  );
  expect(screen.getByText('1 filter ready to apply')).toBeTruthy();
});

it('leaves the wheel showing what was spun, not what is applied', async () => {
  const props = {
    dimensions: DIMENSIONS,
    onApply: jest.fn(),
    onClose: () => {},
  };
  const view = await render(<FilterSheet visible value={{ statusId: null }} {...props} />);
  await tapRow('Cutting');
  await view.rerender(<FilterSheet visible value={{ statusId: null }} {...props} />);
  await view.rerender(<FilterSheet visible value={{ statusId: null }} {...props} />);
  // The button is the visible half of the flicker: it flipped between these
  // two labels on every frame.
  expect(screen.getByText('Apply 1 filter')).toBeTruthy();
  expect(screen.queryByText('Show everything')).toBeNull();
});

it('takes its own title, so a payout filter does not say "orders"', async () => {
  await render(
    <FilterSheet
      visible
      onClose={() => {}}
      dimensions={DIMENSIONS}
      value={{}}
      onApply={() => {}}
      title="Filter payouts"
    />,
  );
  expect(screen.getByText('Filter payouts')).toBeTruthy();
});

it('gives a sheet with three or more wheels the taller layout', async () => {
  const view = await render(
    <FilterSheet
      visible
      onClose={() => {}}
      dimensions={[...DIMENSIONS, { key: 'ownerId', label: 'Owner', options: [] }]}
      value={{}}
      onApply={() => {}}
    />,
  );
  expect(JSON.stringify(view.toJSON())).toContain('"height":"88%"');
});
