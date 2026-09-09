import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PERMISSIONS } from '@fas/shared';
import BoardPage from './page';

const apiMock = {
  orderBoard: jest.fn(),
  allowedNext: jest.fn(),
  allowedBack: jest.fn(),
  changeOrderStatus: jest.fn(),
};

let granted: string[] = [];
jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, can: (p: string) => granted.includes(p) }),
}));
jest.mock('@/lib/api', () => ({
  api: new Proxy(
    {},
    {
      get: (_t, key: string) => (...args: unknown[]) =>
        apiMock[key as keyof typeof apiMock](...args),
    },
  ),
}));

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

jest.mock('@/components/Shell', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

/** The board itself is covered by its own spec; here it is a way to move a card. */
let lastMove: ((order: unknown, toStatusId: string) => void) | null = null;
jest.mock('@/components/KanbanBoard', () => ({
  KanbanBoard: ({
    columns,
    onMove,
    renderCard,
  }: {
    columns: { status: { id: string; name: string }; items: unknown[] }[];
    onMove: (order: unknown, toStatusId: string) => void;
    renderCard: (item: never) => React.ReactNode;
  }) => {
    lastMove = onMove;
    return (
      <div data-testid="board">
        {columns.map((column) => (
          <div key={column.status.id} data-testid={`column-${column.status.id}`}>
            {column.status.name}
            {column.items.map((item, i) => (
              <div key={i}>{renderCard(item as never)}</div>
            ))}
          </div>
        ))}
      </div>
    );
  },
}));

const ORDER = {
  id: 'o1',
  code: 'ORD-1',
  client: { name: 'Verma Interiors' },
  location: 'Andheri',
  priority: 'NORMAL',
  status: { id: 's1', name: 'Punched' },
  items: [{ display: { length: 8, width: 4, unit: 'FT' } }],
};

const BOARD = {
  workflow: { id: 'w1', name: 'Order journey' },
  columns: [
    { status: { id: 's1', name: 'Punched', color: '#6B7785' }, orders: [ORDER] },
    { status: { id: 's2', name: 'Cutting', color: '#FF6B1A' }, orders: [] },
  ],
};

async function mount(board: unknown = BOARD) {
  apiMock.orderBoard.mockResolvedValue(board);
  render(<BoardPage />);
  await screen.findByTestId('board');
}

beforeEach(() => {
  jest.clearAllMocks();
  lastMove = null;
  granted = [];
  apiMock.allowedBack.mockResolvedValue([]);
  apiMock.allowedNext.mockResolvedValue([
    { id: 't1', toStatusId: 's2', requiresNote: false, toStatus: { id: 's2', name: 'Cutting' } },
  ]);
  apiMock.changeOrderStatus.mockResolvedValue({});
  jest.spyOn(window, 'prompt').mockReturnValue('');
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});

it('names the flow the board is showing', async () => {
  await mount();
  expect(screen.getByText(/Order journey/)).toBeInTheDocument();
});

it('says moves the flow forbids are refused, so a failed drag is not a surprise', async () => {
  await mount();
  expect(screen.getByText(/Moves the flow\s+does not allow are refused/)).toBeInTheDocument();
});

it('says it is loading before the board arrives', async () => {
  apiMock.orderBoard.mockReturnValue(new Promise(() => {}));
  render(<BoardPage />);
  expect(await screen.findByText('Loading…')).toBeInTheDocument();
});

it('says why the board could not be read', async () => {
  apiMock.orderBoard.mockRejectedValue(new Error('Network down'));
  render(<BoardPage />);
  expect(await screen.findByText('Network down')).toBeInTheDocument();
});

it('shows a column per stage, with its orders in it', async () => {
  await mount();
  expect(screen.getByTestId('column-s1')).toHaveTextContent('Punched');
  expect(screen.getByTestId('column-s1')).toHaveTextContent('ORD-1');
  expect(screen.getByTestId('column-s2')).toHaveTextContent('Cutting');
});

describe('a card', () => {
  it('carries the code, the client and the site', async () => {
    await mount();
    expect(screen.getByText('ORD-1')).toBeInTheDocument();
    expect(screen.getByText('Verma Interiors')).toBeInTheDocument();
    expect(screen.getByText('Andheri')).toBeInTheDocument();
  });

  it('shows the first size and how many more there are', async () => {
    await mount({
      ...BOARD,
      columns: [
        {
          status: { id: 's1', name: 'Punched' },
          orders: [{ ...ORDER, items: [ORDER.items[0], {}, {}] }],
        },
      ],
    });
    expect(screen.getByText(/8 × 4 ft \+2/)).toBeInTheDocument();
  });

  it('calls out a priority that is not the usual one', async () => {
    await mount({
      ...BOARD,
      columns: [
        { status: { id: 's1', name: 'Punched' }, orders: [{ ...ORDER, priority: 'URGENT' }] },
      ],
    });
    expect(screen.getByText('URGENT')).toBeInTheDocument();
  });

  it('says nothing about a normal priority', async () => {
    await mount();
    expect(screen.queryByText('NORMAL')).not.toBeInTheDocument();
  });

  it('opens on a double click, and says so', async () => {
    await mount();
    fireEvent.doubleClick(screen.getByText('ORD-1'));
    expect(push).toHaveBeenCalledWith('/orders/o1');
    expect(screen.getByText('Double-click a card to open it.')).toBeInTheDocument();
  });
});

describe('moving a card', () => {
  it('moves the order and says where it went', async () => {
    await mount();
    await lastMove!(ORDER, 's2');
    await waitFor(() => expect(apiMock.changeOrderStatus).toHaveBeenCalled());
    expect(apiMock.changeOrderStatus.mock.calls[0]).toEqual([
      'o1',
      { toStatusId: 's2', note: undefined },
    ]);
    expect(await screen.findByText('ORD-1 moved to Cutting.')).toBeInTheDocument();
  });

  it('re-reads the board afterwards rather than moving the card locally', async () => {
    await mount();
    await lastMove!(ORDER, 's2');
    await waitFor(() => expect(apiMock.orderBoard).toHaveBeenCalledTimes(2));
  });

  it('asks for the note the flow demands before trying the move', async () => {
    apiMock.allowedNext.mockResolvedValue([
      { id: 't2', toStatusId: 's2', requiresNote: true, toStatus: { id: 's2', name: 'Cutting' } },
    ]);
    (window.prompt as jest.Mock).mockReturnValue('Sheet loaded');
    await mount();
    await lastMove!(ORDER, 's2');
    // Asked first rather than letting the drop fail and explaining afterwards.
    expect(window.prompt).toHaveBeenCalledWith(
      'Moving ORD-1 to Cutting needs a note. Why?',
    );
    await waitFor(() => expect(apiMock.changeOrderStatus).toHaveBeenCalled());
    expect(apiMock.changeOrderStatus.mock.calls[0][1].note).toBe('Sheet loaded');
  });

  it('cancels the move when the note is left empty', async () => {
    apiMock.allowedNext.mockResolvedValue([
      { id: 't2', toStatusId: 's2', requiresNote: true, toStatus: { id: 's2', name: 'Cutting' } },
    ]);
    (window.prompt as jest.Mock).mockReturnValue('   ');
    await mount();
    await lastMove!(ORDER, 's2');
    expect(apiMock.changeOrderStatus).not.toHaveBeenCalled();
    expect(await screen.findByText('Move cancelled — a note is required.')).toBeInTheDocument();
  });

  describe('dragged backwards', () => {
    /** No arrow forwards to s3; one from s3 into where the order stands. */
    const back = () => {
      apiMock.allowedNext.mockResolvedValue([]);
      apiMock.allowedBack.mockResolvedValue([
        { transitionId: 't0', toStatus: { id: 's3', name: 'Design' } },
      ]);
    };

    it('is refused by the server for somebody not allowed to do it', async () => {
      back();
      apiMock.changeOrderStatus.mockRejectedValue(new Error('Only somebody allowed to can'));
      await mount();
      await lastMove!(ORDER, 's3');
      // Not asked, because it would not be theirs to answer.
      expect(window.confirm).not.toHaveBeenCalled();
      expect(await screen.findByText('Only somebody allowed to can')).toBeInTheDocument();
    });

    it('asks before it goes back, naming both stages', async () => {
      granted = [PERMISSIONS.ORDER_MOVE_BACK];
      back();
      await mount();
      await lastMove!(ORDER, 's3');
      expect((window.confirm as jest.Mock).mock.calls[0][0]).toContain(
        'Punched → Design is not a step this flow draws',
      );
    });

    it('leaves the card where it was when the question is declined', async () => {
      granted = [PERMISSIONS.ORDER_MOVE_BACK];
      back();
      (window.confirm as jest.Mock).mockReturnValue(false);
      await mount();
      await lastMove!(ORDER, 's3');
      expect(apiMock.changeOrderStatus).not.toHaveBeenCalled();
      // Reloaded, so the card snaps back rather than sitting in the wrong column.
      await waitFor(() => expect(apiMock.orderBoard).toHaveBeenCalledTimes(2));
    });

    it('sends it back with the reason and says what happened', async () => {
      granted = [PERMISSIONS.ORDER_MOVE_BACK];
      back();
      (window.prompt as jest.Mock).mockReturnValue(' Client changed it ');
      await mount();
      await lastMove!(ORDER, 's3');
      await waitFor(() => expect(apiMock.changeOrderStatus).toHaveBeenCalled());
      expect(apiMock.changeOrderStatus.mock.calls[0]).toEqual([
        'o1',
        { toStatusId: 's3', note: 'Client changed it', reverse: true },
      ]);
      expect(await screen.findByText('ORD-1 was sent back to Design.')).toBeInTheDocument();
    });

    it('does not offer to reverse a step the order never took', async () => {
      apiMock.allowedNext.mockResolvedValue([]);
      apiMock.allowedBack.mockResolvedValue([]);
      granted = [PERMISSIONS.ORDER_MOVE_BACK];
      apiMock.changeOrderStatus.mockRejectedValue(new Error('The flow does not allow that'));
      await mount();
      await lastMove!(ORDER, 's9');
      expect(window.confirm).not.toHaveBeenCalled();
      expect(await screen.findByText('The flow does not allow that')).toBeInTheDocument();
    });
  });

  it('puts the card back where it really is when the server refuses', async () => {
    apiMock.changeOrderStatus.mockRejectedValue(new Error('That move is not allowed'));
    await mount();
    await lastMove!(ORDER, 's2');
    expect(await screen.findByText('That move is not allowed')).toBeInTheDocument();
    // Reloaded, so the card snaps back rather than sitting in the wrong column.
    await waitFor(() => expect(apiMock.orderBoard).toHaveBeenCalledTimes(2));
  });
});
