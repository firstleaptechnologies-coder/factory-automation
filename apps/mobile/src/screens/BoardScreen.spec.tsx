import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { BoardScreen } from './BoardScreen';

const mockOrderBoard = jest.fn();
const mockChangeStatus = jest.fn();
jest.mock('../api/client', () => ({
  api: {
    orderBoard: () => mockOrderBoard(),
    changeOrderStatus: (...a: unknown[]) => mockChangeStatus(...a),
  },
}));

const ORDER = {
  id: 'o1',
  code: 'ORD-1',
  location: 'Andheri West',
  priority: 'NORMAL',
  client: { name: 'Verma Interiors' },
  items: [
    { id: 'i1', display: { length: 8, width: 4, unit: 'FT' } },
    { id: 'i2', display: { length: 6, width: 3, unit: 'FT' } },
  ],
};

const BOARD = {
  workflow: { name: 'Order journey' },
  columns: [
    { status: { id: 's1', name: 'Cutting', color: '#FF6B1A' }, orders: [ORDER], total: 1 },
    { status: { id: 's2', name: 'Polishing', color: '#2EA043' }, orders: [], total: 0 },
  ],
};

const navigate = jest.fn();

async function mount(board: unknown = BOARD) {
  mockOrderBoard.mockResolvedValue(board);
  await render(
    <GestureHandlerRootView>
      <BoardScreen navigation={{ navigate, goBack: jest.fn() }} />
    </GestureHandlerRootView>,
  );
  await screen.findByText('Board');
}

const dragRight = () =>
  fireGestureHandler(getByGestureTestId('stage-card-o1'), [
    { translationX: 60 },
    { translationX: 120 },
  ]);

beforeEach(() => {
  jest.clearAllMocks();
  mockChangeStatus.mockResolvedValue({});
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  (Alert as unknown as { prompt?: jest.Mock }).prompt = jest.fn();
});

it('names the flow the board is drawn from', async () => {
  await mount();
  expect(screen.getByText('Order journey')).toBeTruthy();
});

it('says how a card is moved and that the flow can refuse it', async () => {
  await mount();
  expect(
    screen.getByText(/Drag a card left or right to move it a stage/),
  ).toBeTruthy();
});

it('shows each order’s client, number, site and first size', async () => {
  await mount();
  expect(screen.getByText('Verma Interiors')).toBeTruthy();
  expect(screen.getByText('ORD-1')).toBeTruthy();
  expect(screen.getByText('Andheri West')).toBeTruthy();
  expect(screen.getByText(/8 × 4 ft\s+\+1/)).toBeTruthy();
});

it('flags a rush job, and says nothing on an ordinary one', async () => {
  await mount();
  expect(screen.queryByText('NORMAL')).toBeNull();
  await mount({
    ...BOARD,
    columns: [{ ...BOARD.columns[0], orders: [{ ...ORDER, priority: 'HIGH' }] }],
  });
  expect(screen.getByText('HIGH')).toBeTruthy();
});

it('opens the flow builder', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Board'));
  expect(navigate).not.toHaveBeenCalled();
});

it('sends the rest of a capped column to the orders list, already filtered', async () => {
  await mount({
    ...BOARD,
    columns: [{ ...BOARD.columns[0], total: 21 }, BOARD.columns[1]],
  });
  await fireEvent.press(screen.getByText('20 more — see all'));
  expect(navigate).toHaveBeenCalledWith('Main', {
    screen: 'Orders',
    params: { statusId: 's1' },
  });
});

describe('moving a card', () => {
  it('asks the server, which checks it against the graph', async () => {
    await mount();
    dragRight();
    await waitFor(() =>
      expect(mockChangeStatus).toHaveBeenCalledWith('o1', { toStatusId: 's2' }),
    );
  });

  it('reloads the board so the card lands where it really is', async () => {
    await mount();
    dragRight();
    await waitFor(() => expect(mockOrderBoard).toHaveBeenCalledTimes(2));
  });

  it('reports a refusal in the server’s own words', async () => {
    mockChangeStatus.mockRejectedValue(
      new Error('The flow does not allow moving from Cutting to Polishing'),
    );
    await mount();
    dragRight();
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe('Cannot move there');
  });

  it('offers to supply a note when that is all that was missing', async () => {
    mockChangeStatus.mockRejectedValue(new Error('Moving to On hold requires a note'));
    await mount();
    dragRight();
    // The person already decided to make the move; asking beats just refusing.
    await waitFor(() =>
      expect((Alert as unknown as { prompt: jest.Mock }).prompt).toHaveBeenCalled(),
    );
    expect((Alert as unknown as { prompt: jest.Mock }).prompt.mock.calls[0][0]).toBe(
      'A note is required',
    );
  });

  it('retries the move with the note that was typed', async () => {
    mockChangeStatus
      .mockRejectedValueOnce(new Error('Moving to On hold requires a note'))
      .mockResolvedValueOnce({});
    await mount();
    dragRight();
    await waitFor(() =>
      expect((Alert as unknown as { prompt: jest.Mock }).prompt).toHaveBeenCalled(),
    );
    const buttons = (Alert as unknown as { prompt: jest.Mock }).prompt.mock
      .calls[0][2] as { text: string; onPress?: (text?: string) => void }[];
    await buttons.find((b) => b.text === 'Move')!.onPress!(' client changed their mind ');
    await waitFor(() =>
      expect(mockChangeStatus).toHaveBeenLastCalledWith('o1', {
        toStatusId: 's2',
        note: 'client changed their mind',
      }),
    );
  });

  it('does not retry on an empty note', async () => {
    mockChangeStatus.mockRejectedValue(new Error('Moving to On hold requires a note'));
    await mount();
    dragRight();
    await waitFor(() =>
      expect((Alert as unknown as { prompt: jest.Mock }).prompt).toHaveBeenCalled(),
    );
    const buttons = (Alert as unknown as { prompt: jest.Mock }).prompt.mock
      .calls[0][2] as { text: string; onPress?: (text?: string) => void }[];
    await buttons.find((b) => b.text === 'Move')!.onPress!('   ');
    expect(mockChangeStatus).toHaveBeenCalledTimes(1);
  });

  describe('dragged backwards', () => {
    const refusedAsBackwards = () =>
      mockChangeStatus.mockRejectedValueOnce(
        new Error('Cutting → Design is a move back, not part of the usual journey.'),
      );

    const prompt = () => (Alert as unknown as { prompt: jest.Mock }).prompt;

    it('asks before it goes back rather than just refusing', async () => {
      refusedAsBackwards();
      await mount();
      dragRight();
      // The server says "move back" only where the arrow exists the other way
      // round and this person may take it, so all that is left is the question.
      await waitFor(() => expect(prompt()).toHaveBeenCalled());
      expect(prompt().mock.calls[0][0]).toBe('Send ORD-1 back?');
    });

    it('sends it back, saying so, with the reason that was typed', async () => {
      refusedAsBackwards();
      mockChangeStatus.mockResolvedValueOnce({});
      await mount();
      dragRight();
      await waitFor(() => expect(prompt()).toHaveBeenCalled());
      const buttons = prompt().mock.calls[0][2] as {
        text: string;
        onPress?: (text?: string) => void;
      }[];
      await buttons.find((b) => b.text === 'Move it back')!.onPress!(' client changed it ');
      await waitFor(() =>
        expect(mockChangeStatus).toHaveBeenLastCalledWith('o1', {
          toStatusId: 's2',
          note: 'client changed it',
          reverse: true,
        }),
      );
    });

    it('leaves it where it is when the question is declined', async () => {
      refusedAsBackwards();
      await mount();
      dragRight();
      await waitFor(() => expect(prompt()).toHaveBeenCalled());
      const buttons = prompt().mock.calls[0][2] as { text: string; style?: string }[];
      expect(buttons.find((b) => b.style === 'cancel')!.text).toBe('Leave it');
      expect(mockChangeStatus).toHaveBeenCalledTimes(1);
    });

    it('still reports a refusal that is not about going back', async () => {
      mockChangeStatus.mockRejectedValue(new Error('Only somebody allowed to can do it'));
      await mount();
      dragRight();
      await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
      expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe('Cannot move there');
    });
  });
});
