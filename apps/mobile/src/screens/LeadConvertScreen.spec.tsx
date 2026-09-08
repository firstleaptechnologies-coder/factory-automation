import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { LeadConvertScreen } from './LeadConvertScreen';

const mockMaterials = jest.fn();
const mockLead = jest.fn();
const mockConvertLead = jest.fn();
jest.mock('../api/client', () => ({
  api: {
    materials: () => mockMaterials(),
    lead: (...a: unknown[]) => mockLead(...a),
    convertLead: (...a: unknown[]) => mockConvertLead(...a),
  },
}));

const { __flushAnimations } = require('react-native-reanimated') as {
  __flushAnimations: (finished?: boolean) => void;
};

const replace = jest.fn();

async function mount(lead: Record<string, unknown> = {}) {
  mockLead.mockResolvedValue({
    id: 'l1',
    code: 'LEAD-1',
    title: 'Kitchen jali',
    location: 'Andheri West',
    ...lead,
  });
  await render(
    <LeadConvertScreen
      route={{ params: { leadId: 'l1' } }}
      navigation={{ replace, goBack: jest.fn() }}
    />,
  );
  await screen.findByText('Convert');
}

/** Fills the one line with a size and a material, which is the minimum. */
async function fillLine() {
  await fireEvent.changeText(screen.getByPlaceholderText('8'), '8');
  await fireEvent.changeText(screen.getByPlaceholderText('4'), '4');
  await fireEvent.press(await screen.findByText('MDF'));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMaterials.mockResolvedValue([
    { id: 'm1', name: 'MDF', color: '#B98B54', thicknesses: [{ id: 't1', valueMm: 18, label: '18mm' }] },
  ]);
  mockConvertLead.mockResolvedValue({ order: { id: 'o1', code: 'ORD-1' } });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

it('starts from the site the lead already recorded', async () => {
  await mount();
  expect(await screen.findByDisplayValue('Andheri West')).toBeTruthy();
});

it('leaves the site blank when the lead had none', async () => {
  await mount({ location: null });
  expect(screen.getByPlaceholderText('Site or address')).toBeTruthy();
});

it('will not convert without a size and a material', async () => {
  await mount();
  const pad = screen.getByText('Hold to convert');
  await fireEvent(pad, 'pressIn');
  __flushAnimations(true);
  // A lead records an enquiry, not dimensions — this is where they arrive.
  await waitFor(() => expect(mockConvertLead).not.toHaveBeenCalled());
});

it('converts the sizes to millimetres before sending them', async () => {
  await mount();
  await fillLine();
  await fireEvent(screen.getByText('Hold to convert'), 'pressIn');
  __flushAnimations(true);
  await waitFor(() => expect(mockConvertLead).toHaveBeenCalled());
  const body = mockConvertLead.mock.calls[0][1];
  expect(body.location).toBe('Andheri West');
  expect(body.items[0].length.value).toBeCloseTo(2438.4, 1);
  expect(body.items[0].width.value).toBeCloseTo(1219.2, 1);
  expect(body.items[0]).toMatchObject({ materialId: 'm1', quantity: 1 });
});

it('sends no thickness rather than an empty one', async () => {
  await mount();
  await fillLine();
  await fireEvent(screen.getByText('Hold to convert'), 'pressIn');
  __flushAnimations(true);
  await waitFor(() => expect(mockConvertLead).toHaveBeenCalled());
  expect(mockConvertLead.mock.calls[0][1].items[0].materialThicknessId).toBeUndefined();
});

it('adds and removes lines', async () => {
  await mount();
  expect(screen.queryByText('Remove')).toBeNull();
  await fireEvent.press(screen.getByText('Add item'));
  expect(screen.getAllByText('Remove').length).toBeGreaterThan(0);
  await fireEvent.press(screen.getAllByText('Remove')[0]);
  expect(screen.queryByText('Remove')).toBeNull();
});

it('opens the order it created and says it was just punched', async () => {
  await mount();
  await fillLine();
  await fireEvent(screen.getByText('Hold to convert'), 'pressIn');
  __flushAnimations(true);
  await waitFor(() =>
    expect(replace).toHaveBeenCalledWith('OrderDetail', {
      orderId: 'o1',
      justPunched: true,
    }),
  );
});

it('shows the server’s refusal rather than losing the work', async () => {
  mockConvertLead.mockRejectedValue(
    new Error('LEAD-1 was already converted into ORD-9'),
  );
  await mount();
  await fillLine();
  await fireEvent(screen.getByText('Hold to convert'), 'pressIn');
  __flushAnimations(true);
  await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
  expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe('Could not convert');
  expect(replace).not.toHaveBeenCalled();
});
