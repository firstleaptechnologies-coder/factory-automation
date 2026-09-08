import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { LeadBoardScreen } from './LeadBoardScreen';

const mockLeadBoard = jest.fn();
const mockChangeLeadStatus = jest.fn();
jest.mock('../api/client', () => ({
  api: {
    leadBoard: () => mockLeadBoard(),
    changeLeadStatus: (...a: unknown[]) => mockChangeLeadStatus(...a),
  },
}));

const LEAD = {
  id: 'l1',
  code: 'LEAD-1',
  title: 'Kitchen jali',
  contactName: 'Verma',
  contactPhone: '9820012345',
  location: 'Andheri',
  estimatedValue: '250000',
  source: { name: 'Referral', color: '#2EA043' },
  client: null,
  convertedOrder: null,
};

const BOARD = {
  workflow: { name: 'Lead pipeline' },
  columns: [
    {
      status: { id: 's1', name: 'New enquiry', color: '#8B949E' },
      leads: [LEAD],
      total: 1,
      value: 250000,
    },
    { status: { id: 's2', name: 'Quoted', color: '#D29922' }, leads: [], total: 0, value: 0 },
  ],
};

const navigate = jest.fn();
const goBack = jest.fn();

async function mount(board: unknown = BOARD) {
  mockLeadBoard.mockResolvedValue(board);
  await render(
    <GestureHandlerRootView>
      <LeadBoardScreen navigation={{ navigate, goBack }} />
    </GestureHandlerRootView>,
  );
  await screen.findByText('Leads');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockChangeLeadStatus.mockResolvedValue({});
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

it('leads with what the whole pipeline is worth', async () => {
  await mount();
  expect(screen.getByText('₹2.50 L in the pipeline')).toBeTruthy();
});

it('shows each stage’s own value under its heading', async () => {
  await mount();
  expect(screen.getAllByText('₹2.50 L').length).toBeGreaterThan(0);
});

it('says nothing about value on a stage worth nothing', async () => {
  await mount();
  // "Quoted" twice: the column head and the hint on the card next to it.
  expect(screen.getAllByText('Quoted').length).toBeGreaterThan(0);
  // Only one stage carries a value subtitle.
  expect(screen.getAllByText('₹2.50 L')).toHaveLength(2);
});

it('shows the enquiry, who it is from and where', async () => {
  await mount();
  expect(screen.getByText('Kitchen jali')).toBeTruthy();
  expect(screen.getByText('Verma · 9820012345')).toBeTruthy();
  expect(screen.getByText('Andheri')).toBeTruthy();
  expect(screen.getByText('Referral')).toBeTruthy();
});

it('falls back to the linked client when there is no contact name', async () => {
  await mount({
    ...BOARD,
    columns: [
      { ...BOARD.columns[0], leads: [{ ...LEAD, contactName: null, client: { name: 'Verma Interiors' } }] },
      BOARD.columns[1],
    ],
  });
  expect(screen.getByText(/Verma Interiors/)).toBeTruthy();
});

it('marks a lead that already became an order', async () => {
  await mount({
    ...BOARD,
    columns: [
      { ...BOARD.columns[0], leads: [{ ...LEAD, convertedOrder: { code: 'ORD-9' } }] },
      BOARD.columns[1],
    ],
  });
  // The pipeline keeps converted leads so it can answer how many became work.
  expect(screen.getByText('ORD-9')).toBeTruthy();
});

it('opens the lead that was tapped', async () => {
  await mount();
  await fireEvent(screen.getByText('Kitchen jali'), 'touchEnd');
  expect(navigate).toHaveBeenCalledWith('LeadDetail', { leadId: 'l1' });
});

it('starts a new enquiry', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Leads'));
  expect(navigate).not.toHaveBeenCalledWith('LeadCreate');
});

it('says when a stage is empty', async () => {
  await mount();
  expect(screen.getByText('No leads')).toBeTruthy();
});

describe('moving a lead', () => {
  const drag = () =>
    fireGestureHandler(getByGestureTestId('stage-card-l1'), [
      { translationX: 60 },
      { translationX: 120 },
    ]);

  it('asks the server, which checks it against the pipeline', async () => {
    await mount();
    drag();
    await waitFor(() =>
      expect(mockChangeLeadStatus).toHaveBeenCalledWith('l1', { toStatusId: 's2' }),
    );
  });

  it('reports a refusal and puts the board back', async () => {
    mockChangeLeadStatus.mockRejectedValue(
      new Error('The pipeline does not allow moving from New enquiry to Quoted'),
    );
    await mount();
    drag();
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe('Cannot move there');
    expect(mockLeadBoard).toHaveBeenCalledTimes(2);
  });
});

describe('a lead dragged backwards', () => {
  const drag = () =>
    fireGestureHandler(getByGestureTestId('stage-card-l1'), [
      { translationX: 60 },
      { translationX: 120 },
    ]);

  const prompt = () => (Alert as unknown as { prompt: jest.Mock }).prompt;

  beforeEach(() => {
    (Alert as unknown as { prompt: jest.Mock }).prompt = jest.fn();
  });

  it('asks before it goes back rather than just refusing', async () => {
    mockChangeLeadStatus.mockRejectedValueOnce(
      new Error('Quoted → Contacted is a move back, not part of the usual journey.'),
    );
    await mount();
    drag();
    // The server says "move back" only where the arrow exists the other way
    // round and this person may take it, so all that is left is the question.
    await waitFor(() => expect(prompt()).toHaveBeenCalled());
    expect(prompt().mock.calls[0][0]).toBe('Send LEAD-1 back?');
  });

  it('sends it back with the reason that was typed', async () => {
    mockChangeLeadStatus.mockRejectedValueOnce(
      new Error('Quoted → Contacted is a move back, not part of the usual journey.'),
    );
    mockChangeLeadStatus.mockResolvedValueOnce({});
    await mount();
    drag();
    await waitFor(() => expect(prompt()).toHaveBeenCalled());
    const buttons = prompt().mock.calls[0][2] as {
      text: string;
      onPress?: (text?: string) => void;
    }[];
    await buttons.find((b) => b.text === 'Move it back')!.onPress!(' talking again ');
    await waitFor(() =>
      expect(mockChangeLeadStatus).toHaveBeenLastCalledWith('l1', {
        toStatusId: 's2',
        note: 'talking again',
        reverse: true,
      }),
    );
  });

  it('still reports a refusal that is not about going back', async () => {
    mockChangeLeadStatus.mockRejectedValue(new Error('Only somebody allowed to can do it'));
    await mount();
    drag();
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe('Cannot move there');
  });
});

it('offers a way back, since it is opened from the home card', async () => {
  await mount();
  await fireEvent.press(screen.getByLabelText('Back'));
  expect(goBack).toHaveBeenCalled();
});
