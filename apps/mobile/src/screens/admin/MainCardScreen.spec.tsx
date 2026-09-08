import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { MainCardScreen } from './MainCardScreen';

const mockDefaultWorkflow = jest.fn();
const mockSetHomeCard = jest.fn();
jest.mock('../../api/client', () => ({
  api: {
    defaultWorkflow: (...a: unknown[]) => mockDefaultWorkflow(...a),
    setHomeCardStatuses: (...a: unknown[]) => mockSetHomeCard(...a),
  },
}));

const ROW = 58;

const stage = (over: Record<string, unknown>) => ({
  color: '#6B7785',
  homeCardOrder: null,
  _count: { ordersAtStatus: 0 },
  ...over,
});

const FLOW = {
  id: 'w1',
  name: 'Order journey',
  statuses: [
    stage({ id: 's0', name: 'Lead' }),
    stage({ id: 's1', name: 'Order confirmed', homeCardOrder: 0, _count: { ordersAtStatus: 4 } }),
    stage({ id: 's2', name: 'Design', homeCardOrder: 1, _count: { ordersAtStatus: 2 } }),
    stage({ id: 's3', name: 'Design approval', homeCardOrder: 2 }),
    stage({ id: 's4', name: 'Production' }),
    stage({ id: 's5', name: 'QC & Sanding' }),
  ],
  transitions: [],
};

const goBack = jest.fn();

async function mount(flow: unknown = FLOW) {
  mockDefaultWorkflow.mockResolvedValue(flow);
  await render(
    <GestureHandlerRootView>
      <MainCardScreen navigation={{ goBack, navigate: jest.fn() }} />
    </GestureHandlerRootView>,
  );
  await screen.findByText('Main card');
}

/** Drag a chosen stage by whole rows; the list reorders when it is let go. */
const drag = (id: string, rows: number) =>
  fireGestureHandler(getByGestureTestId(`main-card-drag-${id}`), [
    { state: 2, translationY: 0 },
    { state: 4, translationY: 0 },
    { translationY: rows * ROW },
    { state: 5, translationY: rows * ROW },
  ]);

/** The stages on the card, in the order they sit in. */
const onCard = () =>
  screen
    .getAllByText(/^(Lead|Order confirmed|Design|Design approval|Production|QC & Sanding)$/)
    .map((node) => node.props.children as string);

beforeEach(() => {
  jest.clearAllMocks();
  mockSetHomeCard.mockResolvedValue({});
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

it('says it is loading rather than showing an empty card', async () => {
  mockDefaultWorkflow.mockReturnValue(new Promise(() => {}));
  await render(
    <GestureHandlerRootView>
      <MainCardScreen navigation={{ goBack, navigate: jest.fn() }} />
    </GestureHandlerRootView>,
  );
  expect(screen.getByText('Loading the flow')).toBeTruthy();
});

it('opens on the stages the card already counts, in their order', async () => {
  await mount();
  expect(onCard().slice(0, 3)).toEqual(['Order confirmed', 'Design', 'Design approval']);
});

it('says how many of the five places are taken', async () => {
  await mount();
  expect(screen.getByText('On the card · 3/5')).toBeTruthy();
});

it('says that the order here is the order there', async () => {
  await mount();
  expect(screen.getByText(/the order here is the order there/)).toBeTruthy();
});

it('shows how many orders sit at each stage', async () => {
  await mount();
  expect(screen.getByText('4 here now')).toBeTruthy();
  expect(screen.getByText('2 here now')).toBeTruthy();
});

it('separates the stages that are not on the card', async () => {
  await mount();
  expect(screen.getByText('Not on the card')).toBeTruthy();
  expect(screen.getByText('Lead')).toBeTruthy();
  expect(screen.getByText('Production')).toBeTruthy();
});

it('says so when the card has nothing on it yet', async () => {
  await mount({ ...FLOW, statuses: [stage({ id: 's0', name: 'Lead' })] });
  expect(screen.getByText('Nothing on the card yet. Add a stage from below.')).toBeTruthy();
});

describe('choosing the stages', () => {
  it('adds one, at the end of the card', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Production'));
    expect(onCard().slice(0, 4)).toEqual([
      'Order confirmed',
      'Design',
      'Design approval',
      'Production',
    ]);
  });

  it('takes one off again', async () => {
    await mount();
    await fireEvent.press(screen.getByTestId('main-card-remove-s2'));
    expect(onCard().slice(0, 2)).toEqual(['Order confirmed', 'Design approval']);
  });

  it('puts a stage taken off back among the ones that are not on the card', async () => {
    await mount();
    await fireEvent.press(screen.getByTestId('main-card-remove-s2'));
    // It has to be addable again, or taking one off by mistake is permanent.
    await fireEvent.press(screen.getAllByText('Design').at(-1)!);
    expect(onCard().slice(0, 3)).toEqual(['Order confirmed', 'Design approval', 'Design']);
  });

  it('stops at five and says why', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Lead'));
    await fireEvent.press(screen.getByText('Production'));
    expect(screen.getByText('On the card · 5/5')).toBeTruthy();
    expect(screen.getByText('The card is full. Take one off to make room.')).toBeTruthy();

    await fireEvent.press(screen.getByText('QC & Sanding'));
    expect(screen.getByText('On the card · 5/5')).toBeTruthy();
  });

  it('says nothing about being full while there is room', async () => {
    await mount();
    expect(screen.queryByText('The card is full. Take one off to make room.')).toBeNull();
  });

  it('says so when the whole flow is on the card', async () => {
    await mount({
      ...FLOW,
      statuses: [
        stage({ id: 's1', name: 'Order confirmed', homeCardOrder: 0 }),
        stage({ id: 's2', name: 'Design', homeCardOrder: 1 }),
      ],
    });
    expect(screen.getByText('Every stage in the flow is on the card.')).toBeTruthy();
  });
});

describe('setting the order', () => {
  it('moves a stage down when it is dragged down', async () => {
    await mount();
    drag('s1', 1);
    await waitFor(() =>
      expect(onCard().slice(0, 3)).toEqual(['Design', 'Order confirmed', 'Design approval']),
    );
  });

  it('moves one up when it is dragged up', async () => {
    await mount();
    drag('s3', -2);
    await waitFor(() =>
      expect(onCard().slice(0, 3)).toEqual(['Design approval', 'Order confirmed', 'Design']),
    );
  });

  it('leaves the list alone when a stage is barely moved', async () => {
    await mount();
    fireGestureHandler(getByGestureTestId('main-card-drag-s1'), [
      { state: 2, translationY: 0 },
      { state: 4, translationY: 0 },
      { translationY: 8 },
      { state: 5, translationY: 8 },
    ]);
    await waitFor(() => expect(onCard()[0]).toBe('Order confirmed'));
  });

  it('will not drag a stage off either end of the card', async () => {
    await mount();
    drag('s1', -4);
    await waitFor(() => expect(onCard()[0]).toBe('Order confirmed'));
    drag('s3', 9);
    await waitFor(() => expect(onCard().slice(0, 3)).toEqual([
      'Order confirmed',
      'Design',
      'Design approval',
    ]));
  });
});

describe('saving', () => {
  it('cannot be saved until something has changed', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Save the card'));
    expect(mockSetHomeCard).not.toHaveBeenCalled();
  });

  it('sends the stages in the order they are shown', async () => {
    await mount();
    drag('s1', 1);
    await waitFor(() => expect(onCard()[0]).toBe('Design'));
    await fireEvent.press(screen.getByText('Save the card'));
    await waitFor(() => expect(mockSetHomeCard).toHaveBeenCalled());
    expect(mockSetHomeCard).toHaveBeenCalledWith('w1', ['s2', 's1', 's3']);
  });

  it('sends an empty card when every stage was taken off', async () => {
    await mount();
    for (const id of ['s1', 's2', 's3']) {
      await fireEvent.press(screen.getByTestId(`main-card-remove-${id}`));
    }
    await fireEvent.press(screen.getByText('Save the card'));
    await waitFor(() => expect(mockSetHomeCard).toHaveBeenCalledWith('w1', []));
  });

  it('goes back once it is saved', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Production'));
    await fireEvent.press(screen.getByText('Save the card'));
    await waitFor(() => expect(goBack).toHaveBeenCalled());
  });

  it('stays put and says why when the server refuses', async () => {
    mockSetHomeCard.mockRejectedValue(new Error('A stage does not belong to this workflow'));
    await mount();
    await fireEvent.press(screen.getByText('Production'));
    await fireEvent.press(screen.getByText('Save the card'));
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Could not save',
        'A stage does not belong to this workflow',
      ),
    );
    expect(goBack).not.toHaveBeenCalled();
  });
});

it('goes back', async () => {
  await mount();
  await fireEvent.press(screen.getByLabelText('Back'));
  expect(goBack).toHaveBeenCalled();
});
