import { render, screen, fireEvent } from '@testing-library/react';
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

function mount(value: Record<string, string | null> = {}, open = true) {
  const onApply = jest.fn();
  const onClose = jest.fn();
  const view = render(
    <FilterSheet
      open={open}
      onClose={onClose}
      dimensions={DIMENSIONS}
      value={value}
      onApply={onApply}
    />,
  );
  return { onApply, onClose, view };
}

it('renders nothing while closed', () => {
  const { view } = mount({}, false);
  expect(view.container).toBeEmptyDOMElement();
});

it('offers a wheel per dimension', () => {
  mount();
  expect(screen.getByText('Material')).toBeInTheDocument();
  expect(screen.getByText('Stage')).toBeInTheDocument();
});

it('says nothing is filtered yet', () => {
  mount();
  expect(screen.getByText('Nothing filtered yet')).toBeInTheDocument();
  expect(screen.getByText('Show everything')).toBeInTheDocument();
});

it('counts the filters already applied, in the singular', () => {
  mount({ materialId: 'm1' });
  expect(screen.getByText('1 filter ready to apply')).toBeInTheDocument();
  expect(screen.getByText('Apply 1 filter')).toBeInTheDocument();
});

it('counts them in the plural', () => {
  mount({ materialId: 'm1', statusId: 's1' });
  expect(screen.getByText('2 filters ready to apply')).toBeInTheDocument();
  expect(screen.getByText('Apply 2 filters')).toBeInTheDocument();
});

it('does not filter anything until Apply is pressed', () => {
  const { onApply } = mount();
  fireEvent.click(screen.getByText('MDF'));
  // Otherwise the list thrashes and re-fetches while somebody is still deciding.
  expect(onApply).not.toHaveBeenCalled();
});

it('applies every wheel together and closes', () => {
  const { onApply, onClose } = mount();
  fireEvent.click(screen.getByText('MDF'));
  fireEvent.click(screen.getByText('Cutting'));
  fireEvent.click(screen.getByText('Apply 2 filters'));
  expect(onApply).toHaveBeenCalledWith({ materialId: 'm1', statusId: 's1' });
  expect(onClose).toHaveBeenCalled();
});

it('applies the empty set when nothing was chosen', () => {
  const { onApply } = mount();
  fireEvent.click(screen.getByText('Show everything'));
  expect(onApply).toHaveBeenCalledWith({});
});

it('offers Clear all only when something is set', () => {
  mount();
  expect(screen.queryByText('Clear all')).not.toBeInTheDocument();
});

it('clears every dimension in one go and applies immediately', () => {
  const { onApply, onClose } = mount({ materialId: 'm1', statusId: 's1' });
  fireEvent.click(screen.getByText('Clear all'));
  expect(onApply).toHaveBeenCalledWith({ materialId: null, statusId: null });
  expect(onClose).toHaveBeenCalled();
});

it('shows what is actually applied when reopened, not what was abandoned', () => {
  const onApply = jest.fn();
  const { rerender } = render(
    <FilterSheet
      open
      onClose={() => {}}
      dimensions={DIMENSIONS}
      value={{ materialId: 'm1' }}
      onApply={onApply}
    />,
  );
  fireEvent.click(screen.getByText('Cutting'));
  expect(screen.getByText('2 filters ready to apply')).toBeInTheDocument();

  const props = { dimensions: DIMENSIONS, value: { materialId: 'm1' }, onApply, onClose: () => {} };
  rerender(<FilterSheet open={false} {...props} />);
  rerender(<FilterSheet open {...props} />);

  expect(screen.getByText('1 filter ready to apply')).toBeInTheDocument();
});

it('can be given its own title', () => {
  render(
    <FilterSheet
      open
      onClose={() => {}}
      dimensions={DIMENSIONS}
      value={{}}
      onApply={() => {}}
      title="Filter payouts"
    />,
  );
  expect(screen.getByText('Filter payouts')).toBeInTheDocument();
});

it('keeps what has been chosen when the list behind it re-renders', () => {
  const onApply = jest.fn();
  const props = { dimensions: DIMENSIONS, onApply, onClose: () => {} };
  const view = render(<FilterSheet open value={{ statusId: null }} {...props} />);
  fireEvent.click(screen.getByText('Cutting'));
  expect(screen.getByText('Apply 1 filter')).toBeInTheDocument();

  /*
   * Every caller passes `value` as an object literal, so an equal one arrives
   * with a new identity on each render of the page behind the sheet. Reacting
   * to that identity put the applied filters back over the draft.
   */
  view.rerender(<FilterSheet open value={{ statusId: null }} {...props} />);
  view.rerender(<FilterSheet open value={{ statusId: null }} {...props} />);
  expect(screen.getByText('Apply 1 filter')).toBeInTheDocument();
  expect(screen.queryByText('Show everything')).not.toBeInTheDocument();
});
