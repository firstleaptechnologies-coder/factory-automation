import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { StageBoard } from './StageBoard';

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

async function mount(props: Record<string, unknown> = {}) {
  const onMove = jest.fn(async () => {});
  const view = await render(
    <GestureHandlerRootView>
    <StageBoard
      columns={(props.columns as never) ?? (COLUMNS as never)}
      renderCard={(item: Card) => <Text>{item.code}</Text>}
      onMove={onMove}
      {...props}
    />
    </GestureHandlerRootView>,
  );
  return { onMove, view };
}

it('shows a column per stage', async () => {
  await mount();
  expect(screen.getByText('Cutting')).toBeTruthy();
  // "Polishing" twice: the column head, and the hint on the card that says
  // where a swipe to the right would send it.
  expect(screen.getAllByText('Polishing')).toHaveLength(2);
});

it('renders each card through the caller’s renderer', async () => {
  await mount();
  expect(screen.getByText('ORD-1')).toBeTruthy();
});

it('says when a stage is empty', async () => {
  await mount({ emptyLabel: 'Nothing in this stage' });
  expect(screen.getByText('Nothing in this stage')).toBeTruthy();
});

it('counts what is on the board when the stage holds no more', async () => {
  await mount();
  expect(screen.getByText('1')).toBeTruthy();
});

it('counts the whole stage, not the slice it was given', async () => {
  await mount({
    columns: [{ ...COLUMNS[0], total: 137 }, COLUMNS[1]],
  });
  // Otherwise the board quietly lies about how much work is in a stage.
  expect(screen.getByText('137')).toBeTruthy();
});

it('offers to open the rest of a capped stage', async () => {
  const onSeeAll = jest.fn();
  await mount({ columns: [{ ...COLUMNS[0], total: 21 }, COLUMNS[1]], onSeeAll });
  await fireEvent.press(screen.getByText('20 more — see all'));
  expect(onSeeAll).toHaveBeenCalledWith(COLUMNS[0].status);
});

it('states the overflow rather than pretending to be a button when there is nowhere to go', async () => {
  await mount({ columns: [{ ...COLUMNS[0], total: 21 }, COLUMNS[1]] });
  expect(screen.getByText('20 more not shown')).toBeTruthy();
});

it('says nothing about overflow when the stage fits', async () => {
  await mount({ columns: [{ ...COLUMNS[0], total: 1 }, COLUMNS[1]] });
  expect(screen.queryByText(/more/)).toBeNull();
});

it('shows a column subtitle, such as a pipeline value', async () => {
  await mount({ columns: [{ ...COLUMNS[0], subtitle: '₹2.50 L' }, COLUMNS[1]] });
  expect(screen.getByText('₹2.50 L')).toBeTruthy();
});

describe('dragging a card', () => {
  /** Gesture Handler fills in the begin/active/end states around these. */
  const drag = (translationX: number) =>
    fireGestureHandler(getByGestureTestId('stage-card-o1'), [
      { translationX: translationX / 2 },
      { translationX },
    ]);

  it('moves the card to the next stage when it is dragged far enough right', async () => {
    const { onMove } = await mount();
    drag(120);
    await waitFor(() => expect(onMove).toHaveBeenCalledWith({ id: 'o1', code: 'ORD-1' }, 's2'));
  });

  it('springs back when the drag was too short to mean it', async () => {
    const { onMove } = await mount();
    drag(40);
    await waitFor(() => expect(onMove).not.toHaveBeenCalled());
  });

  it('has nowhere to go left from the first stage', async () => {
    const { onMove } = await mount();
    drag(-200);
    await waitFor(() => expect(onMove).not.toHaveBeenCalled());
  });

  it('does not walk a card along the flow while a move is still in flight', async () => {
    // The move is async and the board re-renders underneath it, so without the
    // guard one swipe could commit several stages in a row.
    let release: () => void = () => {};
    const onMove = jest.fn(() => new Promise<void>((r) => (release = r)));
    await render(
      <GestureHandlerRootView>
        <StageBoard
          columns={
            [
              COLUMNS[0],
              COLUMNS[1],
              { status: { id: 's3', name: 'Delivered', color: '#2EA043' }, items: [] },
            ] as never
          }
          renderCard={(item: Card) => <Text>{item.code}</Text>}
          onMove={onMove}
        />
      </GestureHandlerRootView>,
    );

    drag(120);
    await waitFor(() => expect(onMove).toHaveBeenCalledTimes(1));
    drag(120);
    drag(120);
    expect(onMove).toHaveBeenCalledTimes(1);
    release();
  });
});
