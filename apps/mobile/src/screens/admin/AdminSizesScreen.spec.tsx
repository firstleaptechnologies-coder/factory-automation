import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AdminSizesScreen } from './AdminSizesScreen';

const mockSizePresets = jest.fn();
const mockCreateSizePreset = jest.fn();
jest.mock('../../api/client', () => ({
  api: {
    sizePresets: (...a: unknown[]) => mockSizePresets(...a),
    createSizePreset: (...a: unknown[]) => mockCreateSizePreset(...a),
  },
}));

const PRESET = {
  id: 'sp1',
  code: 'SHEET-8X4',
  name: '8 × 4 ft sheet',
  lengthMm: '2438.4',
  widthMm: '1219.2',
  thicknessMm: null,
  isActive: true,
};

async function mount(rows: unknown[] = [PRESET]) {
  mockSizePresets.mockResolvedValue(rows);
  await render(<AdminSizesScreen navigation={{ goBack: jest.fn() }} />);
  await screen.findByText('Size presets');
}

const openSheet = () => fireEvent.press(screen.getByText('Add size'));
/** The sheet's own button carries the same words as the one that opened it. */
const submit = () => fireEvent.press(screen.getAllByText('Add size').at(-1)!);

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateSizePreset.mockResolvedValue({});
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

it('says how many are configured, including the deactivated ones', async () => {
  await mount();
  // The admin screen must show what it can turn back on.
  expect(screen.getByText('1 configured')).toBeTruthy();
  expect(mockSizePresets).toHaveBeenCalledWith(true);
});

it('renders each preset in the unit the admin is looking in', async () => {
  await mount();
  expect(screen.getByText('8 × 4 ft sheet')).toBeTruthy();
  expect(screen.getByText('SHEET-8X4')).toBeTruthy();
  // Twice: the preset's own name, and the rendered dimensions beside it.
  expect(screen.getAllByText(/8 × 4/).length).toBe(2);
});

it('re-renders the same preset when the unit changes', async () => {
  await mount();
  await fireEvent.press(screen.getByText('mm'));
  expect(screen.getAllByText(/2438.4 × 1219.2/).length).toBeGreaterThan(0);
});

it('says what will be stored as the size is typed', async () => {
  await mount();
  await openSheet();
  await fireEvent.changeText(await screen.findByPlaceholderText('SHEET-8X4'), 'x');
  expect(screen.queryByText('2438.4 mm')).toBeNull();
});

it('will not add a preset without a code, a name and both sizes', async () => {
  await mount();
  await openSheet();
  await submit();
  expect(mockCreateSizePreset).not.toHaveBeenCalled();
});

it('upper-cases the code, so the list does not fill with near-duplicates', async () => {
  await mount();
  await openSheet();
  await fireEvent.changeText(await screen.findByPlaceholderText('SHEET-8X4'), 'sheet-6x4');
  expect(screen.getByDisplayValue('SHEET-6X4')).toBeTruthy();
});

it('stores every dimension in millimetres, whatever unit was typed in', async () => {
  await mount();
  await openSheet();
  await fireEvent.changeText(await screen.findByPlaceholderText('SHEET-8X4'), 'SHEET-6X4');
  await fireEvent.changeText(screen.getByPlaceholderText('8 × 4 ft sheet'), '6 × 4 ft sheet');
  const [length, width] = screen.getAllByDisplayValue('');
  await fireEvent.changeText(length, '6');
  await fireEvent.changeText(width, '4');
  await submit();
  await waitFor(() => expect(mockCreateSizePreset).toHaveBeenCalled());
  const body = mockCreateSizePreset.mock.calls[0][0];
  expect(body.length.value).toBeCloseTo(1828.8, 1);
  expect(body.width.value).toBeCloseTo(1219.2, 1);
  expect(body.length.unit).toBe('MM');
});

it('leaves thickness off entirely when it was not given', async () => {
  await mount();
  await openSheet();
  await fireEvent.changeText(await screen.findByPlaceholderText('SHEET-8X4'), 'S');
  await fireEvent.changeText(screen.getByPlaceholderText('8 × 4 ft sheet'), 'S');
  const [length, width] = screen.getAllByDisplayValue('');
  await fireEvent.changeText(length, '6');
  await fireEvent.changeText(width, '4');
  await submit();
  await waitFor(() => expect(mockCreateSizePreset).toHaveBeenCalled());
  expect(mockCreateSizePreset.mock.calls[0][0].thickness).toBeUndefined();
});

it('shows the server’s refusal', async () => {
  mockCreateSizePreset.mockRejectedValue(new Error('Unique constraint failed'));
  await mount();
  await openSheet();
  await fireEvent.changeText(await screen.findByPlaceholderText('SHEET-8X4'), 'S');
  await fireEvent.changeText(screen.getByPlaceholderText('8 × 4 ft sheet'), 'S');
  const [length, width] = screen.getAllByDisplayValue('');
  await fireEvent.changeText(length, '6');
  await fireEvent.changeText(width, '4');
  await submit();
  await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
  expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe('Failed');
});
