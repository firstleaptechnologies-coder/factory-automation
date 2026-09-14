import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import FlowBuilderPage from './page';

/**
 * A stand-in for the canvas library: it renders each node through the page's
 * own node component and hands the tests the callbacks, so what is asserted is
 * this page's behaviour rather than react-flow's.
 */
type Handlers = {
  onConnect?: (c: { source: string; target: string }) => void;
  onNodesChange?: (changes: unknown[]) => void;
  onEdgesChange?: (changes: unknown[]) => void;
};
const flow: { nodes: { id: string; position: { x: number; y: number } }[]; edges: { source: string; target: string }[] } & Handlers = {
  nodes: [],
  edges: [],
};

jest.mock('@xyflow/react', () => {
  const react = jest.requireActual('react');
  return {
    __esModule: true,
    Background: () => null,
    Controls: () => null,
    Handle: () => null,
    Position: { Left: 'left', Right: 'right' },
    MarkerType: { ArrowClosed: 'arrowclosed' },
    useNodesState: (initial: unknown[]) => {
      const [value, setValue] = react.useState(initial);
      return [value, setValue, jest.fn()];
    },
    useEdgesState: (initial: unknown[]) => {
      const [value, setValue] = react.useState(initial);
      return [value, setValue, jest.fn()];
    },
    addEdge: (edge: unknown, edges: unknown[]) => [...edges, edge],
    ReactFlow: (props: Record<string, never>) => {
      Object.assign(flow, props);
      const Node = (props.nodeTypes as never as Record<string, React.ComponentType<{ data: unknown }>>).status;
      return (
        <div data-testid="canvas">
          {(props.nodes as never as { id: string; data: unknown }[]).map((node) => (
            <Node key={node.id} data={node.data} />
          ))}
        </div>
      );
    },
  };
});

jest.mock('@xyflow/react/dist/style.css', () => ({}), { virtual: true });

const apiMock = {
  workflows: jest.fn(),
  workflow: jest.fn(),
  saveWorkflowGraph: jest.fn(),
  updateWorkflow: jest.fn(),
  addStatus: jest.fn(),
  updateStatus: jest.fn(),
  removeStatus: jest.fn(),
};
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

const status = (over: Record<string, unknown>) => ({
  color: '#6B7785',
  category: 'OPEN',
  isInitial: false,
  isTerminal: false,
  parentId: null,
  canvasX: 40,
  canvasY: 160,
  _count: { ordersAtStatus: 0 },
  ...over,
});

const PUNCHED = status({ id: 's1', code: 'PUNCHED', name: 'Punched', isInitial: true });
const CUTTING = status({
  id: 's2',
  code: 'CUTTING',
  name: 'Cutting',
  category: 'IN_PROGRESS',
  canvasX: 260,
  _count: { ordersAtStatus: 3 },
});
const DONE = status({ id: 's3', code: 'DONE', name: 'Delivered', isTerminal: true, canvasX: 480 });

const GRAPH = {
  id: 'w1',
  name: 'Order journey',
  kind: 'ORDER',
  statuses: [PUNCHED, CUTTING, DONE],
  transitions: [
    {
      id: 't1',
      fromStatusId: 's1',
      toStatusId: 's2',
      label: null,
      requiresNote: false,
      allowedRoles: [],
    },
    {
      id: 't2',
      fromStatusId: 's2',
      toStatusId: 's3',
      label: null,
      requiresNote: true,
      allowedRoles: ['ADMIN'],
    },
  ],
};

const LIST = [
  { id: 'w1', name: 'Order journey', kind: 'ORDER', isDefault: true },
  { id: 'w0', name: 'Lead pipeline', kind: 'LEAD', isDefault: false },
];

async function mount(graph: unknown = GRAPH, list: unknown[] = LIST) {
  apiMock.workflows.mockResolvedValue(list);
  apiMock.workflow.mockResolvedValue(graph);
  render(<FlowBuilderPage />);
  await screen.findByTestId('canvas');
  await waitFor(() => expect(apiMock.workflow).toHaveBeenCalled());
}

beforeEach(() => {
  jest.clearAllMocks();
  flow.nodes = [];
  flow.edges = [];
  apiMock.saveWorkflowGraph.mockResolvedValue({});
  apiMock.updateWorkflow.mockResolvedValue({});
  apiMock.addStatus.mockResolvedValue({});
  apiMock.updateStatus.mockResolvedValue({});
  apiMock.removeStatus.mockResolvedValue({});
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});

it('opens the default workflow, reading it once', async () => {
  await mount();
  expect(apiMock.workflow).toHaveBeenCalledWith('w1');
  // Loaded twice, the second arrival threw away anything drawn in the gap.
  expect(apiMock.workflow).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/Order journey — this graph is what the API enforces/)).toBeInTheDocument();
});

it('falls back to the first workflow when none is marked default', async () => {
  await mount(GRAPH, [{ id: 'w0', name: 'Lead pipeline', kind: 'LEAD', isDefault: false }]);
  expect(apiMock.workflow).toHaveBeenCalledWith('w0');
});

it('says so when no workflow is configured at all', async () => {
  apiMock.workflows.mockResolvedValue([]);
  render(<FlowBuilderPage />);
  expect(await screen.findByText('No workflow is configured')).toBeInTheDocument();
});

it('says why the flow could not be read', async () => {
  apiMock.workflows.mockRejectedValue(new Error('Network down'));
  render(<FlowBuilderPage />);
  expect(await screen.findByText('Network down')).toBeInTheDocument();
});

it('edits leads or orders from the same canvas', async () => {
  await mount();
  fireEvent.click(document.querySelector('.select-trigger')!);
  fireEvent.click(await screen.findByText('Lead pipeline'));
  await waitFor(() => expect(apiMock.workflow).toHaveBeenCalledWith('w0'));
});

it('says how to draw a move, since dragging a handle is not discoverable', async () => {
  await mount();
  expect(screen.getByText(/Drag from a node’s right handle/)).toBeInTheDocument();
});

describe('the canvas', () => {
  it('places every stage where it was left', async () => {
    await mount();
    expect(flow.nodes.map((n) => [n.id, n.position])).toEqual([
      ['s1', { x: 40, y: 160 }],
      ['s2', { x: 260, y: 160 }],
      ['s3', { x: 480, y: 160 }],
    ]);
  });

  it('draws an arrow for every move the flow allows', async () => {
    await mount();
    expect(flow.edges.map((e) => [e.source, e.target])).toEqual([
      ['s1', 's2'],
      ['s2', 's3'],
    ]);
  });

  it('labels a move that will demand a note', async () => {
    await mount();
    // Drawn by the canvas itself, so what matters is what it is handed.
    expect(flow.edges[1]).toMatchObject({ label: 'note required', style: { strokeDasharray: '6 4' } });
  });

  it('shows each stage with what it means and how many orders sit there', async () => {
    await mount();
    expect(screen.getAllByText('Punched').length).toBeGreaterThan(0);
    expect(screen.getAllByText('IN PROGRESS').length).toBeGreaterThan(0);
    expect(screen.getByText('3 orders')).toBeInTheDocument();
  });

  it('counts a single order in the singular', async () => {
    await mount({ ...GRAPH, statuses: [{ ...CUTTING, _count: { ordersAtStatus: 1 } }] });
    expect(screen.getByText('1 order')).toBeInTheDocument();
  });

  it('marks where the flow starts and ends', async () => {
    await mount();
    expect(screen.getByText(/OPEN · start/)).toBeInTheDocument();
    expect(screen.getByText(/OPEN · end/)).toBeInTheDocument();
  });
});

describe('drawing a move', () => {
  it('adds an arrow and marks the flow unsaved', async () => {
    await mount();
    flow.onConnect!({ source: 's1', target: 's3' });
    await waitFor(() => expect(screen.getByText('Unsaved changes')).toBeInTheDocument());
    expect(flow.edges.map((e) => [e.source, e.target])).toContainEqual(['s1', 's3']);
  });

  it('refuses a stage pointing at itself', async () => {
    await mount();
    flow.onConnect!({ source: 's1', target: 's1' });
    await waitFor(() => expect(flow.edges).toHaveLength(2));
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
  });

  it('marks the flow unsaved once a node has been dropped somewhere new', async () => {
    await mount();
    flow.onNodesChange!([{ type: 'position', dragging: false }]);
    await waitFor(() => expect(screen.getByText('Unsaved changes')).toBeInTheDocument());
  });

  it('says nothing while a node is still under the pointer', async () => {
    await mount();
    flow.onNodesChange!([{ type: 'position', dragging: true }]);
    await waitFor(() => expect(screen.getByTestId('canvas')).toBeInTheDocument());
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
  });

  it('marks the flow unsaved when an arrow is deleted', async () => {
    await mount();
    flow.onEdgesChange!([{ type: 'remove' }]);
    await waitFor(() => expect(screen.getByText('Unsaved changes')).toBeInTheDocument());
  });
});

describe('saving', () => {
  it('writes nothing until Save, so a half-drawn flow strands nobody', async () => {
    await mount();
    flow.onConnect!({ source: 's1', target: 's3' });
    await waitFor(() => expect(screen.getByText('Unsaved changes')).toBeInTheDocument());
    expect(apiMock.saveWorkflowGraph).not.toHaveBeenCalled();
  });

  it('sends every position, rounded to whole pixels', async () => {
    await mount();
    fireEvent.click(screen.getByText('Save flow'));
    await waitFor(() => expect(apiMock.saveWorkflowGraph).toHaveBeenCalled());
    const [id, body] = apiMock.saveWorkflowGraph.mock.calls[0];
    expect(id).toBe('w1');
    expect(body.positions).toEqual([
      { id: 's1', canvasX: 40, canvasY: 160 },
      { id: 's2', canvasX: 260, canvasY: 160 },
      { id: 's3', canvasX: 480, canvasY: 160 },
    ]);
  });

  it('keeps what each move demanded — its note and its roles', async () => {
    await mount();
    fireEvent.click(screen.getByText('Save flow'));
    await waitFor(() => expect(apiMock.saveWorkflowGraph).toHaveBeenCalled());
    expect(apiMock.saveWorkflowGraph.mock.calls[0][1].transitions[1]).toEqual({
      fromStatusId: 's2',
      toStatusId: 's3',
      label: null,
      requiresNote: true,
      allowedRoles: ['ADMIN'],
    });
  });

  it('sends a newly drawn move as one that needs nothing said', async () => {
    await mount();
    flow.onConnect!({ source: 's1', target: 's3' });
    await waitFor(() => expect(screen.getByText('Unsaved changes')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Save flow'));
    await waitFor(() => expect(apiMock.saveWorkflowGraph).toHaveBeenCalled());
    expect(apiMock.saveWorkflowGraph.mock.calls[0][1].transitions.at(-1)).toEqual({
      fromStatusId: 's1',
      toStatusId: 's3',
      label: null,
      requiresNote: false,
      allowedRoles: [],
    });
  });

  it('says what saving did, and re-reads the flow', async () => {
    await mount();
    fireEvent.click(screen.getByText('Save flow'));
    expect(
      await screen.findByText('Flow saved. Orders now follow this graph.'),
    ).toBeInTheDocument();
    expect(apiMock.workflow).toHaveBeenCalledTimes(2);
  });

  it('keeps the changes on screen when the server refuses them', async () => {
    apiMock.saveWorkflowGraph.mockRejectedValue(new Error('A stage would be unreachable'));
    await mount();
    flow.onConnect!({ source: 's1', target: 's3' });
    await waitFor(() => expect(screen.getByText('Unsaved changes')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Save flow'));
    expect(await screen.findByText('A stage would be unreachable')).toBeInTheDocument();
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });

  it('throws the changes away on Revert', async () => {
    await mount();
    flow.onConnect!({ source: 's1', target: 's3' });
    await waitFor(() => expect(screen.getByText('Unsaved changes')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Revert'));
    await waitFor(() => expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument());
    expect(flow.edges).toHaveLength(2);
  });
});

describe('the status table', () => {
  it('warns that a stage holding orders cannot be deleted', async () => {
    await mount();
    expect(screen.getByText(/cannot be deleted until/)).toBeInTheDocument();
  });

  it('lists each stage with its code, meaning and flags', async () => {
    await mount();
    expect(screen.getByText('PUNCHED')).toBeInTheDocument();
    expect(screen.getByText('start')).toBeInTheDocument();
    expect(screen.getByText('end')).toBeInTheDocument();
  });

  it('names a sub-status’s parent', async () => {
    await mount({
      ...GRAPH,
      statuses: [PUNCHED, { ...CUTTING, parentId: 's1' }, DONE],
    });
    // Three times: the node, its own row, and the parent column of the child.
    expect(screen.getAllByText('Punched')).toHaveLength(3);
  });

  it('draws a dash where a stage has no parent and no flags', async () => {
    await mount();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  describe('the moves out of a stage', () => {
    /** The open sheet, since a stage's name is also on the canvas and in the table. */
    const sheet = () => within(document.querySelector('.sheet') as HTMLElement);

    const movesOf = (id: string) =>
      Array.from(screen.getByTestId(`moves-${id}`).querySelectorAll('.chip')).map(
        (chip) => chip.textContent,
      );

    it('lists where each stage can go, the way the app does', async () => {
      await mount();
      // Dragging between two handles is quick with a mouse and impossible to
      // discover; the app has offered this on every stage from the start.
      expect(movesOf('s1')).toEqual(['→ Cutting', '+ Move']);
    });

    it('marks a move that will demand a note', async () => {
      await mount();
      expect(movesOf('s2')).toEqual(['→ Delivered *', '+ Move']);
    });

    it('says so where a stage leads nowhere', async () => {
      await mount();
      expect(screen.getByText('Nothing leaves here')).toBeInTheDocument();
    });

    it('adds a move to the canvas, ready for the same Save', async () => {
      await mount();
      fireEvent.click(screen.getByTestId('moves-s1').querySelector('.chip:last-child')!);
      await screen.findByText('Move out of Punched');
      fireEvent.click(sheet().getByText('Delivered'));
      await waitFor(() => expect(movesOf('s1')).toEqual(['→ Cutting', '→ Delivered', '+ Move']));
      // One rule, one place: the arrow is drawn on the graph and written by the
      // canvas's own Save, not by a second call of its own.
      expect(flow.edges.map((edge) => [edge.source, edge.target])).toContainEqual(['s1', 's3']);
      expect(apiMock.saveWorkflowGraph).not.toHaveBeenCalled();
      expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    });

    it('offers only the stages it cannot already reach', async () => {
      await mount();
      fireEvent.click(screen.getByTestId('moves-s1').querySelector('.chip:last-child')!);
      expect(await screen.findByText('Move out of Punched')).toBeInTheDocument();
      // Cutting is already reachable, and a stage cannot move to itself.
      expect(sheet().queryByText('Cutting')).not.toBeInTheDocument();
      expect(sheet().queryByText('Punched')).not.toBeInTheDocument();
      expect(sheet().getByText('Delivered')).toBeInTheDocument();
    });

    it('says so when a stage can already go everywhere', async () => {
      await mount({
        ...GRAPH,
        statuses: [PUNCHED, CUTTING],
        transitions: [GRAPH.transitions[0]],
      });
      fireEvent.click(screen.getByTestId('moves-s1').querySelector('.chip:last-child')!);
      expect(await screen.findByText('This stage can already go everywhere.')).toBeInTheDocument();
    });

    it('takes a move away, naming both ends before it does', async () => {
      await mount();
      fireEvent.click(screen.getByText('→ Cutting'));
      expect(window.confirm).toHaveBeenCalledWith(
        'Remove this move? Orders will no longer go from Punched to Cutting.',
      );
      await waitFor(() => expect(movesOf('s1')).toEqual(['+ Move']));
      expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    });

    it('keeps the move when the removal is declined', async () => {
      (window.confirm as jest.Mock).mockReturnValue(false);
      await mount();
      fireEvent.click(screen.getByText('→ Cutting'));
      expect(movesOf('s1')).toEqual(['→ Cutting', '+ Move']);
      expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
    });

    it('does not open the stage editor when a move is touched', async () => {
      await mount();
      fireEvent.click(screen.getByTestId('moves-s2').querySelector('.chip:last-child')!);
      expect(await screen.findByText('Move out of Cutting')).toBeInTheDocument();
      // The row opens the editor; the moves cell inside it must not.
      expect(screen.queryByText('Edit Cutting')).not.toBeInTheDocument();
    });
  });
});

it('offers the main card from here, since this is where stages are thought about', async () => {
  await mount();
  fireEvent.click(screen.getByText('Main card'));
  expect(push).toHaveBeenCalledWith('/admin/main-card');
});

/**
 * The picker under one heading.
 *
 * There are two of these panels now — a quote going out and a quote turned
 * down — so "the last select on the page" stopped meaning anything.
 */
const pickerUnder = (heading: string): HTMLElement => {
  const panel = Array.from(document.querySelectorAll('.toolbar')).find((node) =>
    node.querySelector('h3')?.textContent?.startsWith(heading),
  )!;
  return panel.querySelector('.select-trigger') as HTMLElement;
};

describe('when an enquiry goes quiet', () => {
  const LEAD_FLOW = { ...GRAPH, kind: 'LEAD', leadExpiryDays: 30 };

  it('is asked about on a lead pipeline only', async () => {
    await mount();
    // An order does not go stale — somebody is waiting for it.
    expect(screen.queryByText('Goes quiet after')).not.toBeInTheDocument();
  });

  it('opens on what is already set', async () => {
    await mount(LEAD_FLOW);
    expect(screen.getByText('Goes quiet after')).toBeInTheDocument();
    expect(document.querySelector('#expiry')).toHaveValue('30');
  });

  it('says that touching an enquiry starts the clock again', async () => {
    await mount(LEAD_FLOW);
    expect(screen.getByText(/starts the clock\s+again/)).toBeInTheDocument();
  });

  it('saves the number of days and re-reads the flow', async () => {
    await mount(LEAD_FLOW);
    fireEvent.change(document.querySelector('#expiry')!, { target: { value: '45' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() =>
      expect(apiMock.updateWorkflow).toHaveBeenCalledWith('w1', { leadExpiryDays: 45 }),
    );
    expect(await screen.findByText('Saved. Quiet enquiries move to the archive.')).toBeInTheDocument();
  });

  it('turns archiving off when the field is emptied', async () => {
    await mount(LEAD_FLOW);
    fireEvent.change(document.querySelector('#expiry')!, { target: { value: '' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() =>
      expect(apiMock.updateWorkflow).toHaveBeenCalledWith('w1', { leadExpiryDays: null }),
    );
  });

  it('keeps Save on the line of the box it saves', async () => {
    await mount(LEAD_FLOW);
    const field = document.querySelector('#expiry')!.closest('.field-row');
    // The toolbar stretches what it holds to the height of the paragraph
    // beside it, which left Save floating well above the days box.
    expect(field).not.toBeNull();
    expect(field!.querySelector('button.row-action')?.textContent).toBe('Save');
  });

  it('asks which stage means a quote has gone out', async () => {
    await mount(LEAD_FLOW);
    expect(screen.getByText('Sending a quote means')).toBeInTheDocument();
  });

  it('is not asked on an order flow, which is not quoted', async () => {
    await mount();
    expect(screen.queryByText('Sending a quote means')).not.toBeInTheDocument();
  });

  /*
   * The promise read as unconditional, and a shop whose graph had no arrow
   * into the quote stage watched its enquiry sit still with nothing said.
   */
  describe('and a stage cannot reach the quote stage', () => {
    it('names the stages the move will not happen from', async () => {
      await mount({ ...LEAD_FLOW, quoteStatusId: 's3' });
      const warning = screen.getByTestId('quote-stranded');
      // Punched has an arrow to Cutting only; Cutting reaches Delivered.
      expect(warning).toHaveTextContent('Not from Punched');
      expect(warning).toHaveTextContent('Delivered');
      expect(warning).not.toHaveTextContent('Cutting');
    });

    it('says nothing when every stage can get there', async () => {
      await mount({
        ...LEAD_FLOW,
        quoteStatusId: 's3',
        transitions: [
          ...GRAPH.transitions,
          {
            id: 't3',
            fromStatusId: 's1',
            toStatusId: 's3',
            label: null,
            requiresNote: false,
            allowedRoles: [],
          },
        ],
      });
      expect(screen.queryByTestId('quote-stranded')).not.toBeInTheDocument();
    });

    it('says nothing while no stage is chosen', async () => {
      await mount(LEAD_FLOW);
      expect(screen.queryByTestId('quote-stranded')).not.toBeInTheDocument();
    });

    it('leaves out the stages an enquiry is finished at', async () => {
      await mount({
        ...LEAD_FLOW,
        quoteStatusId: 's3',
        statuses: [
          PUNCHED,
          CUTTING,
          DONE,
          status({ id: 's4', code: 'LOST', name: 'Lost', category: 'CANCELLED' }),
        ],
      });
      // Nobody quotes a lost enquiry, so no arrow out of Lost is missing.
      expect(screen.getByTestId('quote-stranded')).not.toHaveTextContent('Lost');
    });

    it('clears once the missing arrow is drawn, before it is even saved', async () => {
      await mount({ ...LEAD_FLOW, quoteStatusId: 's3' });
      expect(screen.getByTestId('quote-stranded')).toBeInTheDocument();
      flow.onConnect!({ source: 's1', target: 's3' });
      await waitFor(() =>
        expect(screen.queryByTestId('quote-stranded')).not.toBeInTheDocument(),
      );
    });
  });

  it('saves the stage that was picked', async () => {
    await mount(LEAD_FLOW);
    fireEvent.click(pickerUnder('Sending a quote means'));
    // "Delivered" also names a stage in the table below.
    await waitFor(() =>
      expect(document.querySelectorAll('.select-option').length).toBeGreaterThan(0),
    );
    fireEvent.click(
      Array.from(document.querySelectorAll('.select-option')).find((node) =>
        node.textContent?.startsWith('Delivered'),
      )!,
    );
    await waitFor(() =>
      expect(apiMock.updateWorkflow).toHaveBeenCalledWith('w1', { quoteStatusId: 's3' }),
    );
  });

  it('turns it off again, so a quote moves nothing', async () => {
    await mount({ ...LEAD_FLOW, quoteStatusId: 's3' });
    fireEvent.click(pickerUnder('Sending a quote means'));
    await waitFor(() =>
      expect(document.querySelectorAll('.select-option').length).toBeGreaterThan(0),
    );
    fireEvent.click(
      Array.from(document.querySelectorAll('.select-option')).find((node) =>
        node.textContent?.startsWith('Nothing'),
      )!,
    );
    await waitFor(() =>
      expect(apiMock.updateWorkflow).toHaveBeenCalledWith('w1', { quoteStatusId: null }),
    );
  });

  it('says why the server refused', async () => {
    apiMock.updateWorkflow.mockRejectedValue(new Error('Too many days'));
    await mount(LEAD_FLOW);
    fireEvent.click(screen.getByText('Save'));
    expect(await screen.findByText('Too many days')).toBeInTheDocument();
  });
});

describe('adding and editing a stage', () => {
  const field = (label: string) =>
    Array.from(document.querySelectorAll('label.field'))
      .find((node) => node.querySelector('.field-label')?.textContent?.startsWith(label))!
      .querySelector('input') as HTMLInputElement;

  it('adds one, at the end of the flow', async () => {
    await mount();
    fireEvent.click(screen.getByText('+ Add stage'));
    fireEvent.change(field('Name'), { target: { value: 'Polishing' } });
    fireEvent.change(field('Code'), { target: { value: 'polish stage' } });
    // The code has to be a safe identifier: it is what the API refers to.
    expect(field('Code')).toHaveValue('POLISH_STAGE');
    fireEvent.click(screen.getAllByText('Add stage').at(-1)!);
    await waitFor(() => expect(apiMock.addStatus).toHaveBeenCalled());
    expect(apiMock.addStatus.mock.calls[0]).toEqual([
      'w1',
      { code: 'POLISH_STAGE', name: 'Polishing', color: '#6B7785', category: 'OPEN', sortOrder: 3 },
    ]);
  });

  it('will not add one without a name and a code', async () => {
    await mount();
    fireEvent.click(screen.getByText('+ Add stage'));
    expect(screen.getAllByText('Add stage').at(-1)!).toBeDisabled();
  });

  it('opens on the stage that was clicked', async () => {
    await mount();
    fireEvent.click(screen.getByTestId('stage-s2'));
    expect(await screen.findByText('Edit Cutting')).toBeInTheDocument();
    expect(field('Name')).toHaveValue('Cutting');
  });

  it('will not let the code be changed, since orders reference it', async () => {
    await mount();
    fireEvent.click(screen.getByTestId('stage-s2'));
    await screen.findByText('Edit Cutting');
    expect(screen.queryByPlaceholderText('PRODUCTION')).not.toBeInTheDocument();
  });

  it('saves the name, colour and meaning', async () => {
    await mount();
    fireEvent.click(screen.getByTestId('stage-s2'));
    await screen.findByText('Edit Cutting');
    fireEvent.change(field('Name'), { target: { value: 'On the machine' } });
    fireEvent.click(screen.getByLabelText('Colour #2EA043'));
    fireEvent.click(screen.getAllByText('Save stage').at(-1)!);
    await waitFor(() => expect(apiMock.updateStatus).toHaveBeenCalled());
    expect(apiMock.updateStatus.mock.calls[0]).toEqual([
      's2',
      { name: 'On the machine', color: '#2EA043', category: 'IN_PROGRESS' },
    ]);
  });

  it('re-reads the flow after a change, so the canvas matches', async () => {
    await mount();
    fireEvent.click(screen.getByTestId('stage-s2'));
    await screen.findByText('Edit Cutting');
    fireEvent.click(screen.getByText('Save stage'));
    await waitFor(() => expect(apiMock.workflow).toHaveBeenCalledTimes(2));
  });

  it('can make a stage the start of the flow', async () => {
    await mount();
    fireEvent.click(screen.getByTestId('stage-s2'));
    await screen.findByText('Edit Cutting');
    fireEvent.click(screen.getByText('Make this the start'));
    await waitFor(() => expect(apiMock.updateStatus).toHaveBeenCalledWith('s2', { isInitial: true }));
  });

  it('says when a stage is already the start', async () => {
    await mount();
    fireEvent.click(screen.getByTestId('stage-s1'));
    expect(await screen.findByText('Already the start')).toBeDisabled();
  });

  it('asks before deleting, and says a stage with orders cannot go', async () => {
    await mount();
    fireEvent.click(screen.getByTestId('stage-s2'));
    await screen.findByText('Edit Cutting');
    fireEvent.click(screen.getByText('Delete stage'));
    expect(window.confirm).toHaveBeenCalledWith(
      'Delete Cutting? Only possible if nothing sits here.',
    );
    await waitFor(() => expect(apiMock.removeStatus).toHaveBeenCalledWith('s2'));
  });

  it('deletes nothing when that is declined', async () => {
    (window.confirm as jest.Mock).mockReturnValue(false);
    await mount();
    fireEvent.click(screen.getByTestId('stage-s2'));
    await screen.findByText('Edit Cutting');
    fireEvent.click(screen.getByText('Delete stage'));
    expect(apiMock.removeStatus).not.toHaveBeenCalled();
  });

  it('says why the server refused', async () => {
    apiMock.addStatus.mockRejectedValue(new Error('Code already used'));
    await mount();
    fireEvent.click(screen.getByText('+ Add stage'));
    fireEvent.change(field('Name'), { target: { value: 'Polishing' } });
    fireEvent.change(field('Code'), { target: { value: 'POLISH' } });
    fireEvent.click(screen.getAllByText('Add stage').at(-1)!);
    expect(await screen.findByText('Code already used')).toBeInTheDocument();
  });
});

describe('the colour a stage is given', () => {
  const field = (label: string) =>
    Array.from(document.querySelectorAll('label.field'))
      .find((node) => node.querySelector('.field-label')?.textContent?.startsWith(label))!
      .querySelector('input') as HTMLInputElement;

  it('is picked from the whole wheel, not from seven of ours', async () => {
    await mount();
    fireEvent.click(screen.getByTestId('stage-s2'));
    await screen.findByText('Edit Cutting');
    // A shop has its own idea of what "Polishing" looks like.
    expect(screen.getByTestId('colour-track-hue')).toBeInTheDocument();
    expect(screen.getByTestId('colour-track-saturation')).toBeInTheDocument();
    expect(screen.getByTestId('colour-track-lightness')).toBeInTheDocument();
  });

  it('shows what the stage will look like before it is saved', async () => {
    await mount();
    fireEvent.click(screen.getByTestId('stage-s2'));
    await screen.findByText('Edit Cutting');
    expect(screen.getByTestId('colour-preview')).toBeInTheDocument();
  });

  it('takes a hex straight off a brand sheet', async () => {
    await mount();
    fireEvent.click(screen.getByTestId('stage-s2'));
    await screen.findByText('Edit Cutting');
    fireEvent.change(field('Hex'), { target: { value: '#123456' } });
    fireEvent.click(screen.getAllByText('Save stage').at(-1)!);
    await waitFor(() => expect(apiMock.updateStatus).toHaveBeenCalled());
    expect(apiMock.updateStatus.mock.calls[0][1].color).toBe('#123456');
  });
});


/**
 * The client said no.
 *
 * Some shops close a declined enquiry; others keep it and work it again — so
 * where it goes is theirs to say, and saying nothing is a real answer.
 */
describe('when a quote is turned down', () => {
  const LEAD_FLOW = { ...GRAPH, kind: 'LEAD', leadExpiryDays: 30 };

  it('asks where the enquiry should go', async () => {
    await mount(LEAD_FLOW);
    expect(screen.getByText('Turning a quote down means')).toBeInTheDocument();
  });

  it('is not asked on an order flow, which is not quoted', async () => {
    await mount();
    expect(screen.queryByText('Turning a quote down means')).not.toBeInTheDocument();
  });

  it('saves the stage that was picked', async () => {
    await mount(LEAD_FLOW);
    fireEvent.click(pickerUnder('Turning a quote down means'));
    await waitFor(() =>
      expect(document.querySelectorAll('.select-option').length).toBeGreaterThan(0),
    );
    fireEvent.click(
      Array.from(document.querySelectorAll('.select-option')).find((node) =>
        node.textContent?.startsWith('Delivered'),
      )!,
    );

    await waitFor(() =>
      expect(apiMock.updateWorkflow).toHaveBeenCalledWith('w1', { lostStatusId: 's3' }),
    );
  });

  it('turns it off again, so a declined quote moves nothing', async () => {
    await mount({ ...LEAD_FLOW, lostStatusId: 's3' });
    fireEvent.click(pickerUnder('Turning a quote down means'));
    await waitFor(() =>
      expect(document.querySelectorAll('.select-option').length).toBeGreaterThan(0),
    );
    fireEvent.click(
      Array.from(document.querySelectorAll('.select-option')).find((node) =>
        node.textContent?.startsWith('Nothing'),
      )!,
    );

    await waitFor(() =>
      expect(apiMock.updateWorkflow).toHaveBeenCalledWith('w1', { lostStatusId: null }),
    );
  });
});
