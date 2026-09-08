import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AdminFlowScreen } from './AdminFlowScreen';

const mockWorkflows = jest.fn();
const mockWorkflow = jest.fn();
const mockAddStatus = jest.fn();
const mockUpdateStatus = jest.fn();
const mockRemoveStatus = jest.fn();
const mockSaveWorkflowGraph = jest.fn();
const mockUpdateWorkflow = jest.fn();
jest.mock('../../api/client', () => ({
  api: {
    workflows: (...a: unknown[]) => mockWorkflows(...a),
    workflow: (...a: unknown[]) => mockWorkflow(...a),
    addStatus: (...a: unknown[]) => mockAddStatus(...a),
    updateStatus: (...a: unknown[]) => mockUpdateStatus(...a),
    removeStatus: (...a: unknown[]) => mockRemoveStatus(...a),
    saveWorkflowGraph: (...a: unknown[]) => mockSaveWorkflowGraph(...a),
    updateWorkflow: (...a: unknown[]) => mockUpdateWorkflow(...a),
  },
}));

const status = (over: Record<string, unknown>) => ({
  color: '#6B7785',
  category: 'OPEN',
  isInitial: false,
  isTerminal: false,
  parentId: null,
  canvasX: 0,
  canvasY: 0,
  sortOrder: 0,
  _count: { ordersAtStatus: 0 },
  ...over,
});

const PUNCHED = status({ id: 's1', code: 'PUNCHED', name: 'Punched', isInitial: true, sortOrder: 0 });
const CUTTING = status({
  id: 's2',
  code: 'CUTTING',
  name: 'Cutting',
  category: 'IN_PROGRESS',
  color: '#2F81F7',
  sortOrder: 1,
  _count: { ordersAtStatus: 3 },
});
const DONE = status({
  id: 's3',
  code: 'DONE',
  name: 'Delivered',
  category: 'DONE',
  isTerminal: true,
  sortOrder: 2,
});

const T1 = {
  id: 't1',
  fromStatusId: 's1',
  toStatusId: 's2',
  label: null,
  requiresNote: false,
  allowedRoles: [],
};
const T2 = {
  id: 't2',
  fromStatusId: 's2',
  toStatusId: 's3',
  label: null,
  requiresNote: true,
  allowedRoles: ['ADMIN'],
};

const GRAPH = {
  id: 'w1',
  name: 'Standard',
  isDefault: true,
  statuses: [PUNCHED, CUTTING, DONE],
  transitions: [T1, T2],
};

const navigate = jest.fn();
const goBack = jest.fn();

async function mount(graph: unknown = GRAPH, list: unknown[] = [{ id: 'w1', name: 'Standard', isDefault: true }]) {
  mockWorkflows.mockResolvedValue(list);
  mockWorkflow.mockResolvedValue(graph);
  // The colour picker's sliders are gestures, which need the root view.
  await render(
    <GestureHandlerRootView>
      <AdminFlowScreen navigation={{ navigate, goBack }} />
    </GestureHandlerRootView>,
  );
  await screen.findByText('Status flow');
}

const openAddSheet = () => fireEvent.press(screen.getByText('Add stage'));
/** The sheet's own submit repeats the label of the button that opened it. */
const submitStage = () => fireEvent.press(screen.getAllByText('Add stage').at(-1)!);

beforeEach(() => {
  jest.clearAllMocks();
  mockAddStatus.mockResolvedValue({});
  mockUpdateStatus.mockResolvedValue({});
  mockRemoveStatus.mockResolvedValue({});
  mockSaveWorkflowGraph.mockResolvedValue({});
  mockUpdateWorkflow.mockResolvedValue({});
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

it('says it is loading rather than showing an empty flow', async () => {
  mockWorkflows.mockResolvedValue([]);
  mockWorkflow.mockReturnValue(new Promise(() => {}));
  await render(<AdminFlowScreen navigation={{ navigate, goBack }} />);
  expect(screen.getByText('Loading the flow')).toBeTruthy();
});

it('opens the default workflow', async () => {
  await mount(GRAPH, [
    { id: 'w0', name: 'Old', isDefault: false },
    { id: 'w1', name: 'Standard', isDefault: true },
  ]);
  expect(mockWorkflow).toHaveBeenCalledWith('w1');
  // Once as the chosen chip, once as the header's subtitle.
  expect(screen.getAllByText('Standard')).toHaveLength(2);
});

it('falls back to the first workflow when none is marked default', async () => {
  await mount(GRAPH, [
    { id: 'w0', name: 'Old', isDefault: false },
    { id: 'w1', name: 'Standard', isDefault: false },
  ]);
  expect(mockWorkflow).toHaveBeenCalledWith('w0');
});

it('offers a choice only when there is more than one workflow', async () => {
  await mount();
  expect(screen.queryByText('Old')).toBeNull();
});

it('switches to another workflow', async () => {
  await mount(GRAPH, [
    { id: 'w1', name: 'Standard', isDefault: true },
    { id: 'w2', name: 'Job work', isDefault: false },
  ]);
  await fireEvent.press(screen.getByText('Job work'));
  await waitFor(() => expect(mockWorkflow).toHaveBeenCalledWith('w2'));
});

it('says that the graph is the rule the API enforces', async () => {
  await mount();
  // The flow is not a diagram of intent — a move with no arrow is refused.
  expect(screen.getByText(/A move with no arrow is refused/)).toBeTruthy();
});

it('opens the canvas on the workflow being looked at', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Open the canvas'));
  expect(navigate).toHaveBeenCalledWith('FlowCanvas', { workflowId: 'w1' });
});

/** Every fixed width the rendered tree asks for, however deeply nested. */
function widthsIn(node: any): number[] {
  if (!node || typeof node !== 'object') return [];
  const children: any[] = Array.isArray(node) ? node : (node.children ?? []);
  const own = [node.props?.style]
    .flat(Infinity)
    .filter(Boolean)
    .map((style: any) => style.width)
    .filter((width: unknown) => typeof width === 'number');
  return [...own, ...children.flatMap(widthsIn)];
}

describe('the stage list', () => {
  it('lists the stages in their configured order, not the order they arrived', async () => {
    await mount({ ...GRAPH, statuses: [DONE, CUTTING, PUNCHED] });
    const names = screen.getAllByText(/^(Punched|Cutting|Delivered)$/).map((n) => n.props.children);
    expect(names).toEqual(['Punched', 'Cutting', 'Delivered']);
  });

  it('marks where a flow starts and where it ends', async () => {
    await mount();
    expect(screen.getByText('START')).toBeTruthy();
    expect(screen.getByText('END')).toBeTruthy();
  });

  it('shows each stage’s code, and its parent when it has one', async () => {
    await mount({
      ...GRAPH,
      statuses: [PUNCHED, { ...CUTTING, parentId: 's1' }, DONE],
    });
    expect(screen.getByText('CUTTING · under Punched')).toBeTruthy();
  });

  it('says what a stage means to the system in words', async () => {
    await mount();
    expect(screen.getByText('in progress')).toBeTruthy();
  });

  it('says how many orders are sitting at each stage', async () => {
    await mount();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getAllByText('0').length).toBe(2);
  });

  it('shows the moves out of each stage', async () => {
    await mount();
    expect(screen.getByText('→ Cutting')).toBeTruthy();
  });

  it('marks a move that will demand a note', async () => {
    await mount();
    expect(screen.getByText('→ Delivered *')).toBeTruthy();
  });

  it('keeps the whole table on the screen, moves and all', async () => {
    await mount();
    // The moves used to be a column of wrapping chips, which made the table
    // 760 points wide: it scrolled sideways, every row stood as tall as its
    // chips, and the part you could see was empty.
    expect(widthsIn(screen.toJSON())).not.toContain(760);
    expect(screen.getByText('→ Cutting')).toBeTruthy();
    expect(screen.getAllByText('Moves out — tap one to remove it').length).toBe(3);
  });

  it('says so where a stage leads nowhere', async () => {
    await mount();
    // A stage with nothing leaving it is a dead end, which is worth seeing.
    expect(screen.getByText('Nothing leaves here')).toBeTruthy();
  });

  it('says so when the flow has no stages at all', async () => {
    await mount({ ...GRAPH, statuses: [], transitions: [] });
    expect(screen.getByText('No stages yet — add one to start the flow')).toBeTruthy();
  });
});

describe('adding a stage', () => {
  it('will not add one without a name and a code', async () => {
    await mount();
    await openAddSheet();
    await submitStage();
    expect(mockAddStatus).not.toHaveBeenCalled();
  });

  it('makes the code a safe identifier as it is typed', async () => {
    await mount();
    await openAddSheet();
    await fireEvent.changeText(await screen.findByPlaceholderText('PRODUCTION'), 'in production');
    expect(screen.getByDisplayValue('IN_PRODUCTION')).toBeTruthy();
  });

  it('adds it at the end of the flow', async () => {
    await mount();
    await openAddSheet();
    await fireEvent.changeText(await screen.findByPlaceholderText('In Production'), 'Polishing');
    await fireEvent.changeText(screen.getByPlaceholderText('PRODUCTION'), 'POLISH');
    await submitStage();
    await waitFor(() => expect(mockAddStatus).toHaveBeenCalled());
    const [workflowId, body] = mockAddStatus.mock.calls[0];
    expect(workflowId).toBe('w1');
    expect(body).toMatchObject({ code: 'POLISH', name: 'Polishing', category: 'OPEN', sortOrder: 3 });
  });

  it('carries the chosen colour and category', async () => {
    await mount();
    await openAddSheet();
    await fireEvent.changeText(await screen.findByPlaceholderText('In Production'), 'Polishing');
    await fireEvent.changeText(screen.getByPlaceholderText('PRODUCTION'), 'POLISH');
    await fireEvent.press(screen.getByTestId('preset-#2EA043'));
    await fireEvent.press(screen.getByText('IN PROGRESS'));
    await submitStage();
    await waitFor(() => expect(mockAddStatus).toHaveBeenCalled());
    expect(mockAddStatus.mock.calls[0][1]).toMatchObject({
      color: '#2EA043',
      category: 'IN_PROGRESS',
    });
  });

  it('reloads the flow after adding', async () => {
    await mount();
    await openAddSheet();
    await fireEvent.changeText(await screen.findByPlaceholderText('In Production'), 'Polishing');
    await fireEvent.changeText(screen.getByPlaceholderText('PRODUCTION'), 'POLISH');
    await submitStage();
    await waitFor(() => expect(mockWorkflow).toHaveBeenCalledTimes(2));
  });

  it('shows the server’s refusal', async () => {
    mockAddStatus.mockRejectedValue(new Error('Code already used'));
    await mount();
    await openAddSheet();
    await fireEvent.changeText(await screen.findByPlaceholderText('In Production'), 'Polishing');
    await fireEvent.changeText(screen.getByPlaceholderText('PRODUCTION'), 'POLISH');
    await submitStage();
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Failed', 'Code already used'));
  });
});

describe('editing a stage', () => {
  const openEdit = async () => {
    await mount();
    await fireEvent(screen.getByTestId('edit-chip-s2'), 'touchEnd');
    return screen.findByText('Edit Cutting');
  };

  it('opens from the stage itself, not only from the pencil', async () => {
    await mount();
    // The pencil is a thumb wide at the end of the row; the stage it belongs
    // to is the whole width of the screen.
    await fireEvent(screen.getByTestId('edit-stage-s2'), 'touchEnd');
    expect(await screen.findByText('Edit Cutting')).toBeTruthy();
  });

  it('says that a stage can be tapped to change it', async () => {
    await mount();
    expect(screen.getByText(/Tap a stage to rename it/)).toBeTruthy();
  });

  it('opens on the stage that was tapped', async () => {
    await openEdit();
    expect(screen.getByDisplayValue('Cutting')).toBeTruthy();
  });

  it('will not let the code be changed, because orders already reference it', async () => {
    await openEdit();
    expect(screen.queryByPlaceholderText('PRODUCTION')).toBeNull();
  });

  it('saves the name, colour and meaning', async () => {
    await openEdit();
    await fireEvent.changeText(screen.getByDisplayValue('Cutting'), ' On the machine ');
    await fireEvent.press(screen.getByText('Save stage'));
    await waitFor(() => expect(mockUpdateStatus).toHaveBeenCalled());
    expect(mockUpdateStatus.mock.calls[0]).toEqual([
      's2',
      { name: 'On the machine', color: '#2F81F7', category: 'IN_PROGRESS' },
    ]);
  });

  it('can make a stage the start of the flow', async () => {
    await openEdit();
    await fireEvent.press(screen.getByText('Make this the start'));
    await waitFor(() => expect(mockUpdateStatus).toHaveBeenCalledWith('s2', { isInitial: true }));
  });

  it('says when a stage is already the start', async () => {
    await mount();
    await fireEvent(screen.getByTestId('edit-chip-s1'), 'touchEnd');
    expect(await screen.findByText('Already the start')).toBeTruthy();
  });

  it('asks before deleting, and says a stage with orders cannot go', async () => {
    await openEdit();
    await fireEvent.press(screen.getByText('Delete stage'));
    expect((Alert.alert as jest.Mock).mock.calls[0][1]).toBe('Only possible if nothing sits here.');
    expect(mockRemoveStatus).not.toHaveBeenCalled();
  });

  it('deletes once that is confirmed', async () => {
    await openEdit();
    await fireEvent.press(screen.getByText('Delete stage'));
    const [, , buttons] = (Alert.alert as jest.Mock).mock.calls[0];
    await buttons.find((b: { text: string }) => b.text === 'Delete').onPress();
    await waitFor(() => expect(mockRemoveStatus).toHaveBeenCalledWith('s2'));
  });
});

describe('the moves between stages', () => {
  it('offers only stages this one cannot already reach', async () => {
    await mount();
    await fireEvent.press(screen.getAllByText('+ Move')[0]);
    await screen.findByText('Move out of Punched');
    // Punched already goes to Cutting, and cannot go to itself, so Delivered
    // is the only thing left to offer.
    expect(screen.getAllByText('Delivered')).toHaveLength(2);
    expect(screen.getAllByText('Cutting')).toHaveLength(1);
    expect(screen.queryByText('Punched')).toBeTruthy();
  });

  it('adds the move without disturbing the ones already there', async () => {
    await mount();
    await fireEvent.press(screen.getAllByText('+ Move')[0]);
    await fireEvent.press(screen.getAllByText('Delivered').at(-1)!);
    await waitFor(() => expect(mockSaveWorkflowGraph).toHaveBeenCalled());
    const [id, body] = mockSaveWorkflowGraph.mock.calls[0];
    expect(id).toBe('w1');
    expect(body.transitions).toHaveLength(3);
    expect(body.transitions.at(-1)).toEqual({
      fromStatusId: 's1',
      toStatusId: 's3',
      label: null,
      requiresNote: false,
      allowedRoles: [],
    });
  });

  it('carries every stage’s canvas position through, so the diagram is not scrambled', async () => {
    await mount({
      ...GRAPH,
      statuses: [{ ...PUNCHED, canvasX: 120, canvasY: 40 }, CUTTING, DONE],
    });
    await fireEvent.press(screen.getAllByText('+ Move')[0]);
    await fireEvent.press(screen.getAllByText('Delivered').at(-1)!);
    await waitFor(() => expect(mockSaveWorkflowGraph).toHaveBeenCalled());
    // The API replaces the whole graph, so anything left out is lost.
    expect(mockSaveWorkflowGraph.mock.calls[0][1].positions[0]).toEqual({
      id: 's1',
      canvasX: 120,
      canvasY: 40,
    });
  });

  it('keeps what a move demanded — its note and its roles', async () => {
    await mount();
    await fireEvent.press(screen.getAllByText('+ Move')[0]);
    await fireEvent.press(screen.getAllByText('Delivered').at(-1)!);
    await waitFor(() => expect(mockSaveWorkflowGraph).toHaveBeenCalled());
    expect(mockSaveWorkflowGraph.mock.calls[0][1].transitions[1]).toEqual({
      fromStatusId: 's2',
      toStatusId: 's3',
      label: null,
      requiresNote: true,
      allowedRoles: ['ADMIN'],
    });
  });

  it('asks before removing a move, naming both ends of it', async () => {
    await mount();
    await fireEvent.press(screen.getByText('→ Cutting'));
    expect((Alert.alert as jest.Mock).mock.calls[0][1]).toBe(
      'Orders will no longer be able to go from Punched to Cutting.',
    );
    expect(mockSaveWorkflowGraph).not.toHaveBeenCalled();
  });

  it('removes only that move once it is confirmed', async () => {
    await mount();
    await fireEvent.press(screen.getByText('→ Cutting'));
    const [, , buttons] = (Alert.alert as jest.Mock).mock.calls[0];
    await buttons.find((b: { text: string }) => b.text === 'Remove').onPress();
    await waitFor(() => expect(mockSaveWorkflowGraph).toHaveBeenCalled());
    const body = mockSaveWorkflowGraph.mock.calls[0][1];
    expect(body.transitions).toEqual([
      { fromStatusId: 's2', toStatusId: 's3', label: null, requiresNote: true, allowedRoles: ['ADMIN'] },
    ]);
    expect(body.positions).toHaveLength(3);
  });

  it('leaves the move alone when the removal is cancelled', async () => {
    await mount();
    await fireEvent.press(screen.getByText('→ Cutting'));
    const [, , buttons] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(buttons.find((b: { text: string }) => b.text === 'Cancel').onPress).toBeUndefined();
    expect(mockSaveWorkflowGraph).not.toHaveBeenCalled();
  });
});

describe('what sending a quote means', () => {
  const LEAD_FLOW = { ...GRAPH, kind: 'LEAD' };

  it('is asked about on a lead pipeline only', async () => {
    await mount();
    // An order is not quoted; an enquiry is.
    expect(screen.queryByText('Sending a quote means')).toBeNull();
    await mount(LEAD_FLOW);
    expect(screen.getAllByText('Sending a quote means').length).toBeGreaterThan(0);
  });

  it('names the stage the shop has chosen', async () => {
    await mount({ ...LEAD_FLOW, quoteStatusId: 's2' });
    // Twice: once in the stage list, once as the answer to this question.
    expect(screen.getAllByText('Cutting').length).toBe(2);
    expect(
      screen.getByText('An enquiry moves here when a quote is sent to the client.'),
    ).toBeTruthy();
  });

  it('says plainly when a quote moves nothing', async () => {
    await mount(LEAD_FLOW);
    // Two cards say "No move" now — this one and the declined-quote one.
    expect(screen.getAllByText('No move').length).toBe(2);
    expect(
      screen.getByText('A quote is recorded against the enquiry but moves it nowhere.'),
    ).toBeTruthy();
  });

  it('offers every stage in the pipeline to choose from', async () => {
    await mount(LEAD_FLOW);
    await fireEvent.press(screen.getByText('A quote is recorded against the enquiry but moves it nowhere.'));
    expect(await screen.findByText('Nothing — leave it where it is')).toBeTruthy();
    expect(screen.getAllByText('Cutting').length).toBeGreaterThan(0);
  });

  it('saves the stage that was picked', async () => {
    await mount(LEAD_FLOW);
    await fireEvent.press(screen.getByText('A quote is recorded against the enquiry but moves it nowhere.'));
    await screen.findByText('Nothing — leave it where it is');
    await fireEvent.press(screen.getAllByText('Delivered').at(-1)!);
    await waitFor(() =>
      expect(mockUpdateWorkflow).toHaveBeenCalledWith('w1', { quoteStatusId: 's3' }),
    );
  });

  it('turns it off again', async () => {
    await mount({ ...LEAD_FLOW, quoteStatusId: 's2' });
    await fireEvent.press(
      screen.getByText('An enquiry moves here when a quote is sent to the client.'),
    );
    await fireEvent.press(await screen.findByText('Nothing — leave it where it is'));
    await waitFor(() =>
      expect(mockUpdateWorkflow).toHaveBeenCalledWith('w1', { quoteStatusId: null }),
    );
  });
});

describe('when an enquiry goes quiet', () => {
  const LEAD_FLOW = { ...GRAPH, kind: 'LEAD', leadExpiryDays: 30 };

  it('is asked about on a lead pipeline only', async () => {
    await mount();
    // An order does not go stale — somebody is waiting for it.
    expect(screen.queryByText('Goes quiet after')).toBeNull();
    await mount(LEAD_FLOW);
    expect(screen.getByText('Goes quiet after')).toBeTruthy();
  });

  it('says what is set, and what that means', async () => {
    await mount(LEAD_FLOW);
    expect(screen.getByText('30d')).toBeTruthy();
    expect(
      screen.getByText('30 days untouched and an enquiry moves to the archive.'),
    ).toBeTruthy();
  });

  it('says plainly when nothing is archived', async () => {
    await mount({ ...LEAD_FLOW, leadExpiryDays: null });
    expect(screen.getByText('Off')).toBeTruthy();
    expect(
      screen.getByText('Never. Enquiries stay on the board however long they sit.'),
    ).toBeTruthy();
  });

  it('opens on what is already set', async () => {
    await mount(LEAD_FLOW);
    await fireEvent.press(screen.getByText('Goes quiet after'));
    expect(await screen.findByDisplayValue('30')).toBeTruthy();
  });

  it('says that touching an enquiry starts the clock again', async () => {
    await mount(LEAD_FLOW);
    await fireEvent.press(screen.getByText('Goes quiet after'));
    expect(await screen.findByText(/starts the clock again/)).toBeTruthy();
  });

  it('saves the number of days', async () => {
    await mount(LEAD_FLOW);
    await fireEvent.press(screen.getByText('Goes quiet after'));
    await fireEvent.changeText(await screen.findByPlaceholderText('30'), '45');
    await fireEvent.press(screen.getAllByText('Save').at(-1)!);
    await waitFor(() => expect(mockUpdateWorkflow).toHaveBeenCalledWith('w1', {
      leadExpiryDays: 45,
    }));
  });

  it('turns archiving off when the field is emptied', async () => {
    await mount(LEAD_FLOW);
    await fireEvent.press(screen.getByText('Goes quiet after'));
    await fireEvent.changeText(await screen.findByPlaceholderText('30'), '');
    await fireEvent.press(screen.getAllByText('Save').at(-1)!);
    await waitFor(() => expect(mockUpdateWorkflow).toHaveBeenCalledWith('w1', {
      leadExpiryDays: null,
    }));
  });

  it('re-reads the flow afterwards', async () => {
    await mount(LEAD_FLOW);
    await fireEvent.press(screen.getByText('Goes quiet after'));
    await fireEvent.changeText(await screen.findByPlaceholderText('30'), '45');
    await fireEvent.press(screen.getAllByText('Save').at(-1)!);
    await waitFor(() => expect(mockWorkflow).toHaveBeenCalledTimes(2));
  });
});

it('offers the main card from here, since this is where stages are thought about', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Main card'));
  expect(navigate).toHaveBeenCalledWith('MainCard');
});

it('offers it even when the shop has only one flow', async () => {
  await mount(GRAPH, [{ id: 'w1', name: 'Standard', isDefault: true }]);
  expect(screen.getByText('Main card')).toBeTruthy();
  expect(screen.queryByText('Job work')).toBeNull();
});

it('goes back', async () => {
  await mount();
  await fireEvent.press(screen.getByLabelText('Back'));
  expect(goBack).toHaveBeenCalled();
});

describe('the colour a stage is given', () => {
  it('is picked from the whole wheel, not from seven of ours', async () => {
    await mount();
    await openAddSheet();
    // A shop has its own idea of what "Polishing" looks like.
    expect(await screen.findByTestId('colour-track-hue')).toBeTruthy();
    expect(screen.getByTestId('colour-track-saturation')).toBeTruthy();
    expect(screen.getByTestId('colour-track-lightness')).toBeTruthy();
  });

  it('shows what the stage will look like before it is saved', async () => {
    await mount();
    await openAddSheet();
    expect(await screen.findByTestId('colour-preview')).toBeTruthy();
  });

  it('takes a hex straight off a brand sheet', async () => {
    await mount();
    await openAddSheet();
    await fireEvent.changeText(await screen.findByPlaceholderText('In Production'), 'Polishing');
    await fireEvent.changeText(screen.getByPlaceholderText('PRODUCTION'), 'POLISH');
    await fireEvent.changeText(screen.getByPlaceholderText('#2EA043'), '#123456');
    await submitStage();
    await waitFor(() => expect(mockAddStatus).toHaveBeenCalled());
    expect(mockAddStatus.mock.calls[0][1].color).toBe('#123456');
  });
});


/**
 * The client said no.
 *
 * Some shops close a declined enquiry; others keep it and work it again — so
 * where it goes is theirs to say, and saying nothing is a real answer.
 */
describe('what turning a quote down means', () => {
  const LEAD_FLOW = { ...GRAPH, kind: 'LEAD' };

  it('asks where the enquiry should go', async () => {
    await mount(LEAD_FLOW);
    expect(screen.getByText('Turning a quote down means')).toBeTruthy();
  });

  it('is not asked on an order flow, which is not quoted', async () => {
    await mount();
    expect(screen.queryByText('Turning a quote down means')).toBeNull();
  });

  it('says plainly when a declined quote moves nothing', async () => {
    await mount(LEAD_FLOW);
    expect(
      screen.getByText('A declined quote is recorded but moves the enquiry nowhere.'),
    ).toBeTruthy();
  });

  it('saves the stage that was picked', async () => {
    await mount(LEAD_FLOW);
    await fireEvent.press(
      screen.getByText('A declined quote is recorded but moves the enquiry nowhere.'),
    );
    await screen.findByText('Nothing — leave it where it is');
    // The stage names appear in the table below as well as in the sheet.
    await fireEvent.press(screen.getAllByText('Delivered').at(-1)!);

    await waitFor(() =>
      expect(mockUpdateWorkflow).toHaveBeenCalledWith('w1', { lostStatusId: 's3' }),
    );
  });

  it('turns it off again', async () => {
    await mount({ ...LEAD_FLOW, lostStatusId: 's3' });
    await fireEvent.press(screen.getByText('An enquiry moves here when the client says no.'));
    await fireEvent.press(await screen.findByText('Nothing — leave it where it is'));

    await waitFor(() =>
      expect(mockUpdateWorkflow).toHaveBeenCalledWith('w1', { lostStatusId: null }),
    );
  });
});
