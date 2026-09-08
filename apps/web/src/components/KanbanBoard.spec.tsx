import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { KanbanBoard } from './KanbanBoard';

interface Card {
  id: string;
  code: string;
}

const COLUMNS = [
  {
    status: { id: 's1', name: 'Cutting', color: '#FF6B1A' },
    items: [{ id: 'o1', code: 'ORD-1' }],
  },
  { status: { id: 's2', name: 'Polishing', color: '#2EA043' }, items: [] },
];

function mount(
  onMove: (item: Card, toStatusId: string) => Promise<void> = async () => {},
  columns = COLUMNS,
) {
  const view = render(
    <KanbanBoard
      columns={columns as never}
      renderCard={(item: Card) => <span>{item.code}</span>}
      onMove={onMove}
      emptyLabel="Nothing here"
    />,
  );
  return {
    view,
    card: () => screen.getByText('ORD-1').closest('.kanban-card') as HTMLElement,
    column: (index: number) => view.container.querySelectorAll('.kanban-col')[index] as HTMLElement,
  };
}

it('shows a column per stage with its count', () => {
  mount();
  expect(screen.getByText('Cutting')).toBeInTheDocument();
  expect(screen.getByText('1')).toBeInTheDocument();
  expect(screen.getByText('0')).toBeInTheDocument();
});

it('says when a column is empty', () => {
  mount();
  expect(screen.getByText('Nothing here')).toBeInTheDocument();
});

it('shows a column subtitle when there is one', () => {
  mount(async () => {}, [{ ...COLUMNS[0], subtitle: '₹2,50,000' }, COLUMNS[1]] as never);
  expect(screen.getByText('₹2,50,000')).toBeInTheDocument();
});

it('renders each card through the caller’s renderer', () => {
  mount();
  expect(screen.getByText('ORD-1')).toBeInTheDocument();
});

it('makes the cards draggable', () => {
  const { card } = mount();
  expect(card()).toHaveAttribute('draggable', 'true');
});

it('moves a card to the column it was dropped on', async () => {
  const onMove = jest.fn(async () => {});
  const { card, column } = mount(onMove);
  fireEvent.dragStart(card());
  fireEvent.drop(column(1));
  await waitFor(() => expect(onMove).toHaveBeenCalledWith({ id: 'o1', code: 'ORD-1' }, 's2'));
});

it('does not ask the server to move a card onto its own column', async () => {
  const onMove = jest.fn(async () => {});
  const { card, column } = mount(onMove);
  fireEvent.dragStart(card());
  fireEvent.drop(column(0));
  await waitFor(() => expect(onMove).not.toHaveBeenCalled());
});

it('ignores a drop that did not start on a card', async () => {
  const onMove = jest.fn(async () => {});
  const { column } = mount(onMove);
  fireEvent.drop(column(1));
  await waitFor(() => expect(onMove).not.toHaveBeenCalled());
});

it('does not offer the drop target the browser would otherwise refuse', () => {
  const { column } = mount();
  const event = new Event('dragover', { bubbles: true, cancelable: true });
  fireEvent(column(1), event);
  // Without preventDefault the browser refuses the drop entirely.
  expect(event.defaultPrevented).toBe(true);
});

it('highlights the column a card is being dragged over', () => {
  const { column } = mount();
  fireEvent.dragOver(column(1));
  expect(column(1)).toHaveClass('over');
  fireEvent.dragLeave(column(1));
  expect(column(1)).not.toHaveClass('over');
});

it('marks the card being dragged', () => {
  const { card } = mount();
  fireEvent.dragStart(card());
  expect(card()).toHaveClass('dragging');
  fireEvent.dragEnd(card());
  expect(card()).not.toHaveClass('dragging');
});

it('does not start a second move while one is still in flight', async () => {
  let release: () => void = () => {};
  const onMove = jest.fn(() => new Promise<void>((r) => (release = r)));
  const { card, column } = mount(onMove);

  fireEvent.dragStart(card());
  fireEvent.drop(column(1));
  await waitFor(() => expect(onMove).toHaveBeenCalledTimes(1));

  fireEvent.dragStart(card());
  fireEvent.drop(column(1));
  expect(onMove).toHaveBeenCalledTimes(1);

  await act(async () => release());
});

it('lets the card go again after a refused move', async () => {
  // The caller reports the refusal and reloads; the board's job is only to
  // stop holding the card. An optimistic move that silently reverts is worse
  // than no optimism at all.
  const refusals: string[] = [];
  const onMove = jest.fn(async () => {
    refusals.push('The flow does not allow that');
  });
  const { card, column } = mount(onMove);

  fireEvent.dragStart(card());
  fireEvent.drop(column(1));
  await waitFor(() => expect(card()).not.toHaveClass('dragging'));

  fireEvent.dragStart(card());
  fireEvent.drop(column(1));
  await waitFor(() => expect(onMove).toHaveBeenCalledTimes(2));
  expect(refusals).toHaveLength(2);
});

it('does not pre-filter drop targets — the server owns that rule', () => {
  const { column } = mount();
  // Both columns accept a dragover; duplicating the graph here would let the
  // two drift apart.
  for (const index of [0, 1]) {
    fireEvent.dragOver(column(index));
    expect(column(index)).toHaveClass('over');
  }
});
