import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { PunchScreen } from './PunchScreen';

const mockMaterials = jest.fn();
const mockPresets = jest.fn();
const mockGstSlabs = jest.fn();
const mockSearchClients = jest.fn();
const mockPunchOrder = jest.fn();
jest.mock('../api/client', () => ({
  api: {
    materials: () => mockMaterials(),
    sizePresets: () => mockPresets(),
    gstSlabs: () => mockGstSlabs(),
    searchClients: (...a: unknown[]) => mockSearchClients(...a),
    punchOrder: (...a: unknown[]) => mockPunchOrder(...a),
  },
}));

const { __flushAnimations } = require('react-native-reanimated') as {
  __flushAnimations: (finished?: boolean) => void;
};

const navigate = jest.fn();

async function mount() {
  await render(<PunchScreen navigation={{ navigate }} />);
  await screen.findByText('Who is it for?');
}

const type = (placeholder: string, value: string) =>
  fireEvent.changeText(screen.getByPlaceholderText(placeholder), value);

const next = () => fireEvent.press(screen.getByText('Continue'));

/** Walks the four questions with the least that will pass each one. */
async function fillToConfirm({ lumpSum = false } = {}) {
  await type('Who is ordering?', 'Verma Interiors');
  await type('Site or address', 'Andheri West');
  await next();

  await screen.findByText('What size?');
  await fireEvent.press(screen.getByTestId('keypad-8'));
  await fireEvent.press(screen.getByText('Width'));
  await fireEvent.press(screen.getByTestId('keypad-4'));
  await next();

  await screen.findByText('In what material?');
  await fireEvent.press(screen.getByText('MDF'));
  await next();

  await screen.findByText('What was quoted?');
  if (lumpSum) {
    await fireEvent.press(screen.getByText('One lump sum'));
  }
  await next();
  await screen.findByText('Check and punch');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMaterials.mockResolvedValue([
    { id: 'm1', name: 'MDF', color: '#B98B54', thicknesses: [{ id: 't1', valueMm: 18, label: '18mm' }] },
  ]);
  mockPresets.mockResolvedValue([
    { id: 'sp1', name: '8 × 4 ft sheet', lengthMm: 2438.4, widthMm: 1219.2 },
  ]);
  mockGstSlabs.mockResolvedValue([{ id: 'g18', name: '18%', ratePct: 18, isDefault: true }]);
  mockSearchClients.mockResolvedValue([]);
  mockPunchOrder.mockResolvedValue({ id: 'o1', code: 'ORD-1' });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

it('asks one short question at a time rather than one long form', async () => {
  await mount();
  // The person doing this is usually on the phone or standing at a site.
  expect(screen.getByText('Who is it for?')).toBeTruthy();
  expect(screen.queryByText('What size?')).toBeNull();
});

it('cannot move on without a client and a site', async () => {
  await mount();
  await next();
  expect(screen.getByText('Who is it for?')).toBeTruthy();
});

it('cannot move on with a client but no site', async () => {
  await mount();
  await type('Who is ordering?', 'Verma');
  await next();
  expect(screen.getByText('Who is it for?')).toBeTruthy();
});

it('moves on once both are given', async () => {
  await mount();
  await type('Who is ordering?', 'Verma');
  await type('Site or address', 'Andheri');
  await next();
  expect(await screen.findByText('What size?')).toBeTruthy();
});

it('cannot move on from a size of nothing', async () => {
  await mount();
  await type('Who is ordering?', 'Verma');
  await type('Site or address', 'Andheri');
  await next();
  await screen.findByText('What size?');
  await next();
  expect(screen.getByText('What size?')).toBeTruthy();
});

it('says what will actually be stored as the size is typed', async () => {
  await mount();
  await type('Who is ordering?', 'Verma');
  await type('Site or address', 'Andheri');
  await next();
  await screen.findByText('What size?');
  // Sizes are short numbers, so the screen carries its own keypad rather than
  // a system keyboard that would cover half of it.
  expect(screen.getByText('millimetres are what get stored')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('keypad-8'));
  await fireEvent.press(screen.getByText('Width'));
  await fireEvent.press(screen.getByTestId('keypad-4'));
  expect(screen.getByText(/stored as 2438.4 × 1219.2 mm/)).toBeTruthy();
});

it('converts what is already typed when the unit changes', async () => {
  await mount();
  await type('Who is ordering?', 'Verma');
  await type('Site or address', 'Andheri');
  await next();
  await screen.findByText('What size?');
  await fireEvent.press(screen.getByTestId('keypad-8'));
  await fireEvent.press(screen.getByText('Width'));
  await fireEvent.press(screen.getByTestId('keypad-4'));
  await fireEvent.press(screen.getByText('mm'));
  // The number has to keep meaning the same thing.
  expect(screen.getByText(/stored as 2438.4 × 1219.2 mm/)).toBeTruthy();
});

it('deletes a digit rather than the whole figure', async () => {
  await mount();
  await type('Who is ordering?', 'Verma');
  await type('Site or address', 'Andheri');
  await next();
  await screen.findByText('What size?');
  await fireEvent.press(screen.getByTestId('keypad-8'));
  await fireEvent.press(screen.getByTestId('keypad-4'));
  await fireEvent.press(screen.getByTestId('keypad-back'));
  await fireEvent.press(screen.getByText('Width'));
  await fireEvent.press(screen.getByTestId('keypad-4'));
  expect(screen.getByText(/stored as 2438.4 × 1219.2 mm/)).toBeTruthy();
});

it('fills both dimensions from a size preset', async () => {
  await mount();
  await type('Who is ordering?', 'Verma');
  await type('Site or address', 'Andheri');
  await next();
  await screen.findByText('What size?');
  await waitFor(() => expect(mockPresets).toHaveBeenCalled());
});

it('cannot move on without a material', async () => {
  await mount();
  await type('Who is ordering?', 'Verma');
  await type('Site or address', 'Andheri');
  await next();
  await screen.findByText('What size?');
  await fireEvent.press(screen.getByTestId('keypad-8'));
  await fireEvent.press(screen.getByText('Width'));
  await fireEvent.press(screen.getByTestId('keypad-4'));
  await next();
  await screen.findByText('In what material?');
  await next();
  expect(screen.getByText('In what material?')).toBeTruthy();
});

it('lets an order be punched before it is priced', async () => {
  await mount();
  await fillToConfirm();
  // A price is optional — the quote often follows the job.
  expect(screen.getByText('Check and punch')).toBeTruthy();
});

it('goes back a step without losing what was entered', async () => {
  await mount();
  await type('Who is ordering?', 'Verma Interiors');
  await type('Site or address', 'Andheri');
  await next();
  await screen.findByText('What size?');
  await fireEvent.press(screen.getByText('What size?'));
  expect(screen.getByText('What size?')).toBeTruthy();
});

describe('punching', () => {
  it('needs a deliberate hold, not a tap', async () => {
    await mount();
    await fillToConfirm();
    const pad = screen.getByText('Hold to punch');
    await fireEvent(pad, 'pressIn');
    await fireEvent(pad, 'pressOut');
    __flushAnimations(true);
    expect(mockPunchOrder).not.toHaveBeenCalled();
  });

  it('sends the order once the hold completes', async () => {
    await mount();
    await fillToConfirm();
    await fireEvent(screen.getByText('Hold to punch'), 'pressIn');
    __flushAnimations(true);
    await waitFor(() => expect(mockPunchOrder).toHaveBeenCalled());

    const body = mockPunchOrder.mock.calls[0][0];
    expect(body).toMatchObject({
      newClient: { name: 'Verma Interiors' },
      location: 'Andheri West',
      pricingMode: 'ITEMISED',
      taxTreatment: 'EXCLUSIVE',
    });
    expect(body.items[0]).toMatchObject({
      materialId: 'm1',
      quantity: 1,
      length: { unit: 'MM' },
      width: { unit: 'MM' },
    });
  });

  it('sends the size in millimetres whatever unit was typed in', async () => {
    await mount();
    await fillToConfirm();
    await fireEvent(screen.getByText('Hold to punch'), 'pressIn');
    __flushAnimations(true);
    await waitFor(() => expect(mockPunchOrder).toHaveBeenCalled());
    const item = mockPunchOrder.mock.calls[0][0].items[0];
    // 8 ft and 4 ft, stored canonically.
    expect(item.length.value).toBeCloseTo(2438.4, 1);
    expect(item.width.value).toBeCloseTo(1219.2, 1);
  });

  it('sends no rate at all when the job was not priced', async () => {
    await mount();
    await fillToConfirm();
    await fireEvent(screen.getByText('Hold to punch'), 'pressIn');
    __flushAnimations(true);
    await waitFor(() => expect(mockPunchOrder).toHaveBeenCalled());
    expect(mockPunchOrder.mock.calls[0][0].items[0].rate).toBeUndefined();
  });

  it('opens the punched order and says so', async () => {
    await mount();
    await fillToConfirm();
    await fireEvent(screen.getByText('Hold to punch'), 'pressIn');
    __flushAnimations(true);
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('OrderDetail', {
        orderId: 'o1',
        justPunched: true,
      }),
    );
  });

  it('shows the server’s refusal rather than losing the order', async () => {
    mockPunchOrder.mockRejectedValue(
      new Error('Workflow "Production" has no stage an order can start at'),
    );
    await mount();
    await fillToConfirm();
    await fireEvent(screen.getByText('Hold to punch'), 'pressIn');
    __flushAnimations(true);
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe('Could not punch');
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('lump-sum pricing', () => {
  it('carries the figure on the order, not on the line', async () => {
    await mount();
    await fillToConfirm({ lumpSum: true });
    await fireEvent(screen.getByText('Hold to punch'), 'pressIn');
    __flushAnimations(true);
    await waitFor(() => expect(mockPunchOrder).toHaveBeenCalled());
    const body = mockPunchOrder.mock.calls[0][0];
    expect(body.pricingMode).toBe('LUMP_SUM');
    // A per-line rate would be a number nobody quoted.
    expect(body.items[0].rate).toBeUndefined();
    expect(body.items[0].rateUnit).toBeUndefined();
    expect(body.items[0].gstSlabId).toBeUndefined();
  });
});
