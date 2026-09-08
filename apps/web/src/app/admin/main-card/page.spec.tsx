import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MainCardPage from './page';

const apiMock = { defaultWorkflow: jest.fn(), setHomeCardStatuses: jest.fn() };
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

const stage = (over: Record<string, unknown>) => ({
  color: '#6B7785',
  homeCardOrder: null,
  _count: { ordersAtStatus: 0 },
  ...over,
});

const FLOW = {
  id: 'w1',
  statuses: [
    stage({ id: 's0', name: 'Lead' }),
    stage({ id: 's1', name: 'Order confirmed', homeCardOrder: 0, _count: { ordersAtStatus: 4 } }),
    stage({ id: 's2', name: 'Design', homeCardOrder: 1 }),
    stage({ id: 's3', name: 'Design approval', homeCardOrder: 2 }),
    stage({ id: 's4', name: 'Production' }),
    stage({ id: 's5', name: 'QC & Sanding' }),
  ],
};

async function mount(flow: unknown = FLOW) {
  apiMock.defaultWorkflow.mockResolvedValue(flow);
  render(<MainCardPage />);
  await screen.findByText('Main card');

  // The card is filled from the loaded flow in an effect, which lands a render
  // after the header does.
  const expected = (flow as { statuses: { homeCardOrder?: number | null }[] }).statuses.filter(
    (status) => status.homeCardOrder !== null && status.homeCardOrder !== undefined,
  ).length;
  await waitFor(() =>
    expect(document.querySelectorAll('[data-testid^="chosen-"]')).toHaveLength(expected),
  );
}

/** The stages on the card, in the order they sit in. */
const onCard = () =>
  Array.from(document.querySelectorAll('[data-testid^="chosen-"] .t-body')).map(
    (node) => node.textContent,
  );

/** Drag one stage onto another, the way a pointer would. */
const dragOnto = (fromId: string, toId: string) => {
  const from = screen.getByTestId(`chosen-${fromId}`);
  const to = screen.getByTestId(`chosen-${toId}`);
  fireEvent.dragStart(from);
  fireEvent.dragOver(to);
  fireEvent.drop(to);
  fireEvent.dragEnd(from);
};

beforeEach(() => {
  jest.clearAllMocks();
  apiMock.setHomeCardStatuses.mockResolvedValue({});
});

it('says it is loading rather than showing an empty card', async () => {
  apiMock.defaultWorkflow.mockReturnValue(new Promise(() => {}));
  render(<MainCardPage />);
  expect(await screen.findByText('Loading the flow')).toBeInTheDocument();
});

it('opens on the stages the card already counts, in their order', async () => {
  await mount();
  expect(onCard()).toEqual(['Order confirmed', 'Design', 'Design approval']);
});

it('says how many of the five places are taken', async () => {
  await mount();
  expect(screen.getByText('On the card · 3/5')).toBeInTheDocument();
});

it('shows how many orders sit at each stage', async () => {
  await mount();
  expect(screen.getByText('4 here now')).toBeInTheDocument();
});

it('separates the stages that are not on the card', async () => {
  await mount();
  expect(screen.getByText('Not on the card')).toBeInTheDocument();
  expect(screen.getByText('Lead')).toBeInTheDocument();
});

describe('choosing the stages', () => {
  it('adds one at the end of the card', async () => {
    await mount();
    fireEvent.click(screen.getByText('Production'));
    expect(onCard()).toEqual(['Order confirmed', 'Design', 'Design approval', 'Production']);
  });

  it('takes one off again, and it becomes addable', async () => {
    await mount();
    fireEvent.click(screen.getByLabelText('Take Design off the card'));
    expect(onCard()).toEqual(['Order confirmed', 'Design approval']);
    fireEvent.click(screen.getByText('Design'));
    expect(onCard()).toEqual(['Order confirmed', 'Design approval', 'Design']);
  });

  it('stops at five and says why', async () => {
    await mount();
    fireEvent.click(screen.getByText('Lead'));
    fireEvent.click(screen.getByText('Production'));
    expect(screen.getByText('On the card · 5/5')).toBeInTheDocument();
    expect(screen.getByText('The card is full. Take one off to make room.')).toBeInTheDocument();

    fireEvent.click(screen.getByText('QC & Sanding'));
    expect(screen.getByText('On the card · 5/5')).toBeInTheDocument();
  });

  it('says so when the whole flow is on the card', async () => {
    await mount({
      ...FLOW,
      statuses: [
        stage({ id: 's1', name: 'Order confirmed', homeCardOrder: 0 }),
        stage({ id: 's2', name: 'Design', homeCardOrder: 1 }),
      ],
    });
    expect(screen.getByText('Every stage in the flow is on the card.')).toBeInTheDocument();
  });
});

describe('setting the order', () => {
  it('drops a stage in front of the one it was let go over', async () => {
    await mount();
    dragOnto('s3', 's1');
    expect(onCard()).toEqual(['Design approval', 'Order confirmed', 'Design']);
  });

  it('moves one down the same way', async () => {
    await mount();
    dragOnto('s1', 's3');
    expect(onCard()).toEqual(['Design', 'Design approval', 'Order confirmed']);
  });

  it('leaves the list alone when a stage is dropped on itself', async () => {
    await mount();
    dragOnto('s1', 's1');
    expect(onCard()).toEqual(['Order confirmed', 'Design', 'Design approval']);
  });

  it('ignores a drop with nothing being dragged', async () => {
    await mount();
    fireEvent.drop(screen.getByTestId('chosen-s2'));
    expect(onCard()).toEqual(['Order confirmed', 'Design', 'Design approval']);
  });
});

describe('saving', () => {
  it('cannot be saved until something has changed', async () => {
    await mount();
    expect(screen.getByText('Save the card')).toBeDisabled();
  });

  it('sends the stages in the order they are shown', async () => {
    await mount();
    dragOnto('s3', 's1');
    fireEvent.click(screen.getByText('Save the card'));
    await waitFor(() => expect(apiMock.setHomeCardStatuses).toHaveBeenCalled());
    expect(apiMock.setHomeCardStatuses).toHaveBeenCalledWith('w1', ['s3', 's1', 's2']);
  });

  it('sends an empty card when every stage was taken off', async () => {
    await mount();
    for (const name of ['Order confirmed', 'Design', 'Design approval']) {
      fireEvent.click(screen.getByLabelText(`Take ${name} off the card`));
    }
    fireEvent.click(screen.getByText('Save the card'));
    await waitFor(() => expect(apiMock.setHomeCardStatuses).toHaveBeenCalledWith('w1', []));
  });

  it('goes to the home screen once it is saved, where the card is', async () => {
    await mount();
    fireEvent.click(screen.getByText('Production'));
    fireEvent.click(screen.getByText('Save the card'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
  });

  it('stays put and says why when the server refuses', async () => {
    apiMock.setHomeCardStatuses.mockRejectedValue(new Error('A stage does not belong here'));
    await mount();
    fireEvent.click(screen.getByText('Production'));
    fireEvent.click(screen.getByText('Save the card'));
    expect(await screen.findByText('A stage does not belong here')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
