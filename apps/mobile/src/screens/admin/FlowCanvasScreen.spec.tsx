import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { FlowCanvasScreen } from './FlowCanvasScreen';

const mockWorkflows = jest.fn();
const mockWorkflow = jest.fn();
const mockSaveWorkflowGraph = jest.fn();
jest.mock('../../api/client', () => ({
  api: {
    workflows: (...a: unknown[]) => mockWorkflows(...a),
    workflow: (...a: unknown[]) => mockWorkflow(...a),
    saveWorkflowGraph: (...a: unknown[]) => mockSaveWorkflowGraph(...a),
  },
}));

const NODE_W = 156;
const NODE_H = 78;

const status = (over: Record<string, unknown>) => ({
  color: '#6B7785',
  category: 'OPEN',
  isInitial: false,
  isTerminal: false,
  parentId: null,
  canvasX: 0,
  canvasY: 0,
  sortOrder: 0,
  ...over,
});

/** Laid out far apart, so a drop lands where the test aims it. */
const PUNCHED = status({ id: 's1', code: 'PUNCHED', name: 'Punched', isInitial: true, canvasX: 0, canvasY: 0 });
const CUTTING = status({ id: 's2', code: 'CUTTING', name: 'Cutting', canvasX: 400, canvasY: 0 });
const DONE = status({ id: 's3', code: 'DONE', name: 'Delivered', isTerminal: true, canvasX: 800, canvasY: 0 });

const T1 = {
  id: 't1',
  workflowId: 'w1',
  fromStatusId: 's1',
  toStatusId: 's2',
  label: null,
  requiresNote: false,
  allowedRoles: [],
};

const GRAPH = {
  id: 'w1',
  name: 'Standard',
  kind: 'ORDER',
  isDefault: true,
  statuses: [PUNCHED, CUTTING, DONE],
  transitions: [T1],
};

const navigate = jest.fn();
const goBack = jest.fn();

async function mount(graph: unknown = GRAPH, list: unknown[] = [{ id: 'w1', name: 'Standard', kind: 'ORDER', isDefault: true }], params: unknown = { workflowId: 'w1' }) {
  mockWorkflows.mockResolvedValue(list);
  mockWorkflow.mockResolvedValue(graph);
  await render(
    <GestureHandlerRootView>
      <FlowCanvasScreen route={{ params }} navigation={{ navigate, goBack }} />
    </GestureHandlerRootView>,
  );
  await screen.findByText('Flow builder');
}

/** Drag the link handle out of one node and drop it on a point. */
const dragLink = (from: string, to: { x: number; y: number }, origin: { x: number; y: number }) => {
  const translationX = to.x - (origin.x + NODE_W);
  const translationY = to.y - (origin.y + NODE_H / 2);
  return fireGestureHandler(getByGestureTestId(`flow-link-${from}`), [
    { state: 2, translationX: 0, translationY: 0 },
    { state: 4, translationX: 0, translationY: 0 },
    // A gesture-handler ACTIVE event is the start; an update is a following
    // event with no state of its own.
    { translationX, translationY },
    { state: 5, translationX, translationY },
  ]);
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSaveWorkflowGraph.mockResolvedValue({});
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

it('says it is loading rather than showing an empty board', async () => {
  mockWorkflows.mockResolvedValue([]);
  mockWorkflow.mockReturnValue(new Promise(() => {}));
  await render(
    <GestureHandlerRootView>
      <FlowCanvasScreen route={{ params: {} }} navigation={{ navigate, goBack }} />
    </GestureHandlerRootView>,
  );
  expect(screen.getByText('Loading the flow')).toBeTruthy();
});

it('opens the workflow it was sent to', async () => {
  await mount(GRAPH, [
    { id: 'w0', name: 'Leads', kind: 'LEAD', isDefault: true },
    { id: 'w1', name: 'Standard', kind: 'ORDER', isDefault: false },
  ]);
  expect(mockWorkflow).toHaveBeenCalledWith('w1');
});

it('falls back to the default workflow when it was sent nowhere in particular', async () => {
  await mount(
    GRAPH,
    [
      { id: 'w0', name: 'Leads', kind: 'LEAD', isDefault: false },
      { id: 'w1', name: 'Standard', kind: 'ORDER', isDefault: true },
    ],
    {},
  );
  await waitFor(() => expect(mockWorkflow).toHaveBeenCalledWith('w1'));
});

it('survives being opened with no route params at all', async () => {
  mockWorkflows.mockResolvedValue([{ id: 'w1', name: 'Standard', kind: 'ORDER', isDefault: true }]);
  mockWorkflow.mockResolvedValue(GRAPH);
  await render(
    <GestureHandlerRootView>
      <FlowCanvasScreen route={{}} navigation={{ navigate, goBack }} />
    </GestureHandlerRootView>,
  );
  expect(await screen.findByText('Flow builder')).toBeTruthy();
});

it('draws every stage on the board', async () => {
  await mount();
  expect(screen.getByText('Punched')).toBeTruthy();
  expect(screen.getByText('Cutting')).toBeTruthy();
  expect(screen.getByText('Delivered')).toBeTruthy();
});

it('marks which stage starts the flow and which ends it', async () => {
  await mount();
  expect(screen.getByText('start · PUNCHED')).toBeTruthy();
  expect(screen.getByText('end · DONE')).toBeTruthy();
  expect(screen.getByText('CUTTING')).toBeTruthy();
});

it('counts the stages and the moves', async () => {
  await mount();
  expect(screen.getByText('3 stages · 1 moves')).toBeTruthy();
});

it('explains how to draw a move, since a drag is not discoverable', async () => {
  await mount();
  expect(screen.getByText(/Drag out of its right edge onto another stage/)).toBeTruthy();
});

it('labels the workflows by what they run, not by their names', async () => {
  await mount(GRAPH, [
    { id: 'w0', name: 'Enquiry pipeline', kind: 'LEAD', isDefault: false },
    { id: 'w1', name: 'Standard', kind: 'ORDER', isDefault: true },
  ]);
  expect(screen.getByText('Leads')).toBeTruthy();
  expect(screen.getByText('Orders')).toBeTruthy();
});

describe('a flow nobody has arranged yet', () => {
  it('lays the stages out as a staircase rather than a pile at the origin', async () => {
    await mount({
      ...GRAPH,
      statuses: [
        status({ id: 's1', code: 'A', name: 'A' }),
        status({ id: 's2', code: 'B', name: 'B' }),
      ],
      transitions: [],
    });
    // Both would sit at 0,0 and hide each other otherwise.
    fireGestureHandler(getByGestureTestId('flow-drag-s2'), [
      { state: 2, translationX: 0, translationY: 0 },
      { state: 5, translationX: 0, translationY: 0 },
    ]);
    await waitFor(() => expect(screen.getByText('Unsaved changes')).toBeTruthy());
    await fireEvent.press(screen.getByText('Save flow'));
    await waitFor(() => expect(mockSaveWorkflowGraph).toHaveBeenCalled());
    const positions = mockSaveWorkflowGraph.mock.calls[0][1].positions;
    expect(positions.find((p: { id: string }) => p.id === 's1')).toEqual({ id: 's1', canvasX: 80, canvasY: 80 });
    expect(positions.find((p: { id: string }) => p.id === 's2')).toEqual({ id: 's2', canvasX: 270, canvasY: 200 });
  });

  it('leaves a stage deliberately parked at the origin where it is', async () => {
    await mount();
    fireGestureHandler(getByGestureTestId('flow-drag-s2'), [
      { state: 2, translationX: 0, translationY: 0 },
      { state: 4, translationX: 0, translationY: 0 },
      { translationX: 1, translationY: 0 },
      { state: 5, translationX: 1, translationY: 0 },
    ]);
    await waitFor(() => expect(screen.getByText('Unsaved changes')).toBeTruthy());
    await fireEvent.press(screen.getByText('Save flow'));
    await waitFor(() => expect(mockSaveWorkflowGraph).toHaveBeenCalled());
    // 0,0 is a position like any other once the flow has been arranged.
    expect(mockSaveWorkflowGraph.mock.calls[0][1].positions).toContainEqual({
      id: 's1',
      canvasX: 0,
      canvasY: 0,
    });
  });

  it('keeps the arrangement of a flow that has one', async () => {
    await mount();
    fireGestureHandler(getByGestureTestId('flow-drag-s2'), [
      { state: 2, translationX: 0, translationY: 0 },
      { state: 5, translationX: 0, translationY: 0 },
    ]);
    await waitFor(() => expect(screen.getByText('Unsaved changes')).toBeTruthy());
    await fireEvent.press(screen.getByText('Save flow'));
    await waitFor(() => expect(mockSaveWorkflowGraph).toHaveBeenCalled());
    expect(mockSaveWorkflowGraph.mock.calls[0][1].positions).toContainEqual({
      id: 's2',
      canvasX: 400,
      canvasY: 0,
    });
  });
});

describe('moving a stage', () => {
  it('starts with nothing to save', async () => {
    await mount();
    expect(screen.getByText('Everything saved')).toBeTruthy();
  });

  it('marks the board unsaved once something has moved', async () => {
    await mount();
    fireGestureHandler(getByGestureTestId('flow-drag-s1'), [
      { state: 2, translationX: 0, translationY: 0 },
      { state: 4, translationX: 0, translationY: 0 },
      { translationX: 60, translationY: 30 },
      { state: 5, translationX: 60, translationY: 30 },
    ]);
    await waitFor(() => expect(screen.getByText('Unsaved changes')).toBeTruthy());
  });

  it('saves where the stage was dropped, rounded to whole pixels', async () => {
    await mount();
    fireGestureHandler(getByGestureTestId('flow-drag-s1'), [
      { state: 2, translationX: 0, translationY: 0 },
      { state: 4, translationX: 0, translationY: 0 },
      { translationX: 60.4, translationY: 30.6 },
      { state: 5, translationX: 60.4, translationY: 30.6 },
    ]);
    await waitFor(() => expect(screen.getByText('Unsaved changes')).toBeTruthy());
    await fireEvent.press(screen.getByText('Save flow'));
    await waitFor(() => expect(mockSaveWorkflowGraph).toHaveBeenCalled());
    expect(mockSaveWorkflowGraph.mock.calls[0][1].positions).toContainEqual({
      id: 's1',
      canvasX: 60,
      canvasY: 31,
    });
  });
});

describe('the wires between stages', () => {
  /** Where a wire starts, and how long and which way it runs. */
  const wire = (id: string) => {
    const style = screen.getByTestId(id).props.style.flat();
    const box = Object.assign({}, ...style);
    return {
      left: box.left,
      top: box.top,
      width: Math.round(box.width),
      rotate: box.transform[0].rotate,
    };
  };

  it('runs from one stage’s right edge to the other’s left edge', async () => {
    await mount();
    // s1 sits at 0,0 and s2 at 400,0, so the wire leaves at (156, 39) and runs
    // flat for the 244 between them.
    expect(wire('edge-s1-s2')).toEqual({ left: 156, top: 39, width: 244, rotate: '0rad' });
  });

  it('follows a stage that has been dragged somewhere else', async () => {
    await mount();
    fireGestureHandler(getByGestureTestId('flow-drag-s1'), [
      { state: 2, translationX: 0, translationY: 0 },
      { state: 4, translationX: 0, translationY: 0 },
      { translationX: 0, translationY: 200 },
      { state: 5, translationX: 0, translationY: 200 },
    ]);
    // Otherwise the arrow stays pinned to where the stage used to be, pointing
    // at empty board.
    await waitFor(() => expect(wire('edge-s1-s2').top).toBe(239));
    expect(wire('edge-s1-s2').rotate).not.toBe('0rad');
  });

  it('draws no wire at all when one end is missing', async () => {
    await mount({
      ...GRAPH,
      transitions: [{ ...T1, id: 't9', toStatusId: 'gone' }],
    });
    expect(screen.queryByTestId('edge-s1-gone')).toBeNull();
  });

  it('shows nothing being dragged until a wire is pulled', async () => {
    await mount();
    expect(screen.queryByTestId('link-wire')).toBeNull();
  });

  it('takes the dragged wire away once it lands', async () => {
    await mount();
    dragLink('s1', { x: 820, y: 20 }, { x: 0, y: 0 });
    await waitFor(() => expect(screen.queryByTestId('link-wire')).toBeNull());
  });

  /*
   * The wire mid-drag is not asserted here: gesture-handler's test utility
   * appends an END to any sequence, so the drag always finishes and the wire
   * is gone again before the assertion runs. It is checked on a device.
   */
});

describe('drawing a move', () => {
  it('connects two stages when the wire lands on one', async () => {
    await mount();
    dragLink('s1', { x: 820, y: 20 }, { x: 0, y: 0 });
    await waitFor(() => expect(screen.getByText('3 stages · 2 moves')).toBeTruthy());
  });

  it('leaves the flow alone when the wire lands on empty board', async () => {
    await mount();
    dragLink('s1', { x: 1800, y: 1800 }, { x: 0, y: 0 });
    await waitFor(() => expect(screen.getByText('Everything saved')).toBeTruthy());
    expect(screen.getByText('3 stages · 1 moves')).toBeTruthy();
  });

  it('will not connect a stage to itself', async () => {
    await mount();
    // Dropped back on its own body.
    dragLink('s1', { x: 40, y: 20 }, { x: 0, y: 0 });
    await waitFor(() => expect(screen.getByText('3 stages · 1 moves')).toBeTruthy());
  });

  it('will not add a move that already exists', async () => {
    await mount();
    dragLink('s1', { x: 420, y: 20 }, { x: 0, y: 0 });
    await waitFor(() => expect(screen.getByText('3 stages · 1 moves')).toBeTruthy());
    expect(screen.getByText('Everything saved')).toBeTruthy();
  });

  it('sends the new move to the server with the rest of the graph', async () => {
    await mount();
    dragLink('s1', { x: 820, y: 20 }, { x: 0, y: 0 });
    await waitFor(() => expect(screen.getByText('Unsaved changes')).toBeTruthy());
    await fireEvent.press(screen.getByText('Save flow'));
    await waitFor(() => expect(mockSaveWorkflowGraph).toHaveBeenCalled());
    const body = mockSaveWorkflowGraph.mock.calls[0][1];
    expect(body.transitions).toHaveLength(2);
    expect(body.transitions.at(-1)).toEqual({
      fromStatusId: 's1',
      toStatusId: 's3',
      label: null,
      requiresNote: false,
      allowedRoles: [],
    });
  });
});

describe('moving around the board', () => {
  /** The style the board is drawn with, after any animation has settled. */
  const boardStyle = () => {
    const view = screen.getByTestId('canvas-board');
    return Object.assign({}, ...[view.props.style].flat(Infinity).filter(Boolean));
  };

  const transformOf = (key: string) =>
    (boardStyle().transform as Record<string, number>[] | undefined)?.find(
      (part) => key in part,
    )?.[key];

  /** The board is 2400 wide and scaled about its own centre. */
  const CANVAS_MID = 1200;
  const VIEW = { width: 360, height: 500 };

  /** Give the canvas a size, which jest never measures on its own. */
  const measure = async () =>
    fireEvent(screen.getByTestId('canvas-viewport'), 'layout', {
      nativeEvent: { layout: { width: VIEW.width, height: VIEW.height, x: 0, y: 0 } },
    });

  /** Which point of the board is under the middle of the screen right now. */
  const underTheMiddle = () => {
    const scale = transformOf('scale') ?? 1;
    const tx = transformOf('translateX') ?? 0;
    return (VIEW.width / 2 - tx - CANVAS_MID * (1 - scale)) / scale;
  };

  it('pans with one finger on empty board', async () => {
    await mount();
    fireGestureHandler(getByGestureTestId('flow-board-pan'), [
      { state: 2, translationX: 0, translationY: 0 },
      { state: 4, translationX: 0, translationY: 0 },
      { translationX: -220, translationY: -40 },
      { state: 5, translationX: -220, translationY: -40 },
    ]);
    // Two fingers was the old rule, and nobody found out the board moved.
    await waitFor(() => expect(transformOf('translateX')).toBe(-220));
    expect(transformOf('translateY')).toBe(-40);
  });

  it('zooms in and out from the buttons', async () => {
    await mount();
    await fireEvent.press(screen.getByTestId('zoom-in'));
    await waitFor(() => expect(transformOf('scale')).toBeGreaterThan(1));
    await fireEvent.press(screen.getByTestId('zoom-out'));
    await fireEvent.press(screen.getByTestId('zoom-out'));
    await waitFor(() => expect(transformOf('scale')).toBeLessThan(1));
  });

  it('keeps what you were looking at in the middle as it zooms', async () => {
    await mount();
    await measure();
    fireGestureHandler(getByGestureTestId('flow-board-pan'), [
      { state: 2, translationX: 0, translationY: 0 },
      { state: 4, translationX: 0, translationY: 0 },
      { translationX: -300, translationY: 0 },
      { state: 5, translationX: -300, translationY: 0 },
    ]);
    await waitFor(() => expect(transformOf('translateX')).toBe(-300));
    const held = underTheMiddle();

    await fireEvent.press(screen.getByTestId('zoom-in'));
    await waitFor(() => expect(transformOf('scale')).toBeGreaterThan(1));
    // Scaling happens about the board's centre, two thousand points away, so
    // without the correction the stage you were reading flies off the screen.
    expect(underTheMiddle()).toBeCloseTo(held, 1);

    await fireEvent.press(screen.getByTestId('zoom-out'));
    await waitFor(() => expect(transformOf('scale')).toBeCloseTo(1, 2));
    expect(underTheMiddle()).toBeCloseTo(held, 1);
  });

  it('will not zoom past what stays readable, or past what fits', async () => {
    await mount();
    for (let i = 0; i < 12; i += 1) await fireEvent.press(screen.getByTestId('zoom-in'));
    await waitFor(() => expect(transformOf('scale')).toBeCloseTo(1.6, 2));
    for (let i = 0; i < 20; i += 1) await fireEvent.press(screen.getByTestId('zoom-out'));
    await waitFor(() => expect(transformOf('scale')).toBeCloseTo(0.3, 2));
  });

  it('puts the whole flow back in view', async () => {
    await mount();
    fireGestureHandler(getByGestureTestId('flow-board-pan'), [
      { state: 2, translationX: 0, translationY: 0 },
      { state: 4, translationX: 0, translationY: 0 },
      { translationX: -900, translationY: -700 },
      { state: 5, translationX: -900, translationY: -700 },
    ]);
    await waitFor(() => expect(transformOf('translateX')).toBe(-900));
    await fireEvent.press(screen.getByTestId('fit-view'));
    // Whatever was dragged where, the stages come back on screen.
    await waitFor(() => expect(transformOf('translateX')).not.toBe(-900));
  });

  it('fits a flow with no stages without dividing by nothing', async () => {
    await mount({ ...GRAPH, statuses: [], transitions: [] });
    await fireEvent.press(screen.getByTestId('fit-view'));
    await waitFor(() => expect(transformOf('scale')).toBe(1));
  });
});

describe('the stage sheet', () => {
  const openSheet = async (id = 's1') => {
    fireGestureHandler(getByGestureTestId(`flow-tap-${id}`), [{ state: 4 }, { state: 5 }]);
    return screen.findByText(/moves out of this stage/);
  };

  it('opens on a tap and says which stage it is', async () => {
    await mount();
    await openSheet();
    expect(screen.getByText('PUNCHED · moves out of this stage')).toBeTruthy();
  });

  it('lists where the stage can go', async () => {
    await mount();
    await openSheet();
    expect(screen.getByText('→ Cutting')).toBeTruthy();
  });

  it('says so, and how to fix it, when a stage leads nowhere', async () => {
    await mount();
    await openSheet('s3');
    expect(screen.getByText(/Nothing leaves this stage yet/)).toBeTruthy();
  });

  it('asks before removing a move, naming both ends', async () => {
    await mount();
    await openSheet();
    await fireEvent.press(screen.getByText('→ Cutting'));
    expect((Alert.alert as jest.Mock).mock.calls[0][1]).toBe(
      'Orders will no longer go from Punched to Cutting.',
    );
  });

  it('removes the move once that is confirmed, and marks the board unsaved', async () => {
    await mount();
    await openSheet();
    await fireEvent.press(screen.getByText('→ Cutting'));
    const [, , buttons] = (Alert.alert as jest.Mock).mock.calls[0];
    await buttons.find((b: { text: string }) => b.text === 'Remove').onPress();
    await waitFor(() => expect(screen.getByText('3 stages · 0 moves')).toBeTruthy());
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
  });

  it('keeps the move when the removal is declined', async () => {
    await mount();
    await openSheet();
    await fireEvent.press(screen.getByText('→ Cutting'));
    const [, , buttons] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(buttons.find((b: { text: string }) => b.text === 'Keep it').onPress).toBeUndefined();
    expect(screen.getByText('3 stages · 1 moves')).toBeTruthy();
  });

  it('hands the stage over to the list editor, which is where a stage is renamed', async () => {
    await mount();
    await openSheet();
    await fireEvent.press(screen.getByText('Edit this stage'));
    expect(navigate).toHaveBeenCalledWith('AdminFlow', { focusStatusId: 's1' });
  });
});

describe('saving', () => {
  it('cannot be pressed while there is nothing to save', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Save flow'));
    expect(mockSaveWorkflowGraph).not.toHaveBeenCalled();
  });

  it('goes back to saved and reloads once the server has it', async () => {
    await mount();
    fireGestureHandler(getByGestureTestId('flow-drag-s1'), [
      { state: 2, translationX: 0, translationY: 0 },
      { state: 4, translationX: 0, translationY: 0 },
      { translationX: 20, translationY: 20 },
      { state: 5, translationX: 20, translationY: 20 },
    ]);
    await waitFor(() => expect(screen.getByText('Unsaved changes')).toBeTruthy());
    await fireEvent.press(screen.getByText('Save flow'));
    await waitFor(() => expect(screen.getByText('Everything saved')).toBeTruthy());
    expect(mockWorkflow).toHaveBeenCalledTimes(2);
  });

  it('keeps the changes on screen when the server refuses them', async () => {
    mockSaveWorkflowGraph.mockRejectedValue(new Error('Terminal stage cannot move on'));
    await mount();
    fireGestureHandler(getByGestureTestId('flow-drag-s1'), [
      { state: 2, translationX: 0, translationY: 0 },
      { state: 4, translationX: 0, translationY: 0 },
      { translationX: 20, translationY: 20 },
      { state: 5, translationX: 20, translationY: 20 },
    ]);
    await waitFor(() => expect(screen.getByText('Unsaved changes')).toBeTruthy());
    await fireEvent.press(screen.getByText('Save flow'));
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Could not save', 'Terminal stage cannot move on'),
    );
    // Losing the arrangement on a failed save would mean doing it all again.
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
  });
});

it('goes back', async () => {
  await mount();
  await fireEvent.press(screen.getByLabelText('Back'));
  expect(goBack).toHaveBeenCalled();
});
