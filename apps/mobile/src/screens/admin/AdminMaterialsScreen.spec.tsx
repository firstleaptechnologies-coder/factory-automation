import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AdminMaterialsScreen } from './AdminMaterialsScreen';

const mockMaterials = jest.fn();
const mockCreateMaterial = jest.fn();
const mockUpdateMaterial = jest.fn();
const mockAddThickness = jest.fn();
const mockRemoveThickness = jest.fn();
jest.mock('../../api/client', () => ({
  api: {
    materials: (...a: unknown[]) => mockMaterials(...a),
    createMaterial: (...a: unknown[]) => mockCreateMaterial(...a),
    updateMaterial: (...a: unknown[]) => mockUpdateMaterial(...a),
    addThickness: (...a: unknown[]) => mockAddThickness(...a),
    removeThickness: (...a: unknown[]) => mockRemoveThickness(...a),
  },
}));

const PLYWOOD = {
  id: 'm1',
  code: 'PLY',
  name: 'Plywood',
  color: '#C08A4B',
  isActive: true,
  thicknesses: [
    { id: 't1', valueMm: '18', label: null },
    { id: 't2', valueMm: '19.05', label: '3/4 in' },
  ],
};

const HIDDEN = { id: 'm2', code: 'ACR', name: 'Acrylic', color: null, isActive: false, thicknesses: [] };

const goBack = jest.fn();

async function mount(rows: unknown[] = [PLYWOOD]) {
  mockMaterials.mockResolvedValue(rows);
  await render(<AdminMaterialsScreen navigation={{ goBack }} />);
  await screen.findByText('Materials');
}

/** The sheet's own submit sits after the button that opened it. */
const openAddSheet = () => fireEvent.press(screen.getByText('Add material'));

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateMaterial.mockResolvedValue({});
  mockUpdateMaterial.mockResolvedValue({});
  mockAddThickness.mockResolvedValue({});
  mockRemoveThickness.mockResolvedValue({});
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

it('waits for the list rather than flashing an empty screen', async () => {
  mockMaterials.mockReturnValue(new Promise(() => {}));
  await render(<AdminMaterialsScreen navigation={{ goBack }} />);
  expect(screen.queryByText('Add material')).toBeNull();
});

it('asks for the hidden materials too, since this is where they are brought back', async () => {
  await mount();
  expect(mockMaterials).toHaveBeenCalledWith(true);
});

it('says how many are configured', async () => {
  await mount([PLYWOOD, HIDDEN]);
  expect(screen.getByText('2 configured')).toBeTruthy();
});

it('shows each material with its code and thicknesses', async () => {
  await mount();
  expect(screen.getByText('Plywood')).toBeTruthy();
  expect(screen.getByText('PLY')).toBeTruthy();
  expect(screen.getByText('18 mm')).toBeTruthy();
});

it('prefers the label a thickness was given over the raw millimetres', async () => {
  await mount();
  // 19.05 mm is what is stored; "3/4 in" is what the shop calls it.
  expect(screen.getByText('3/4 in')).toBeTruthy();
  expect(screen.queryByText('19.05 mm')).toBeNull();
});

it('says so when a material has no thicknesses yet', async () => {
  await mount([HIDDEN]);
  expect(screen.getByText('None yet')).toBeTruthy();
});

it('marks a deactivated material as hidden rather than dropping it', async () => {
  await mount([HIDDEN]);
  expect(screen.getByText('Hidden')).toBeTruthy();
});

describe('activation', () => {
  it('hides a material that is currently offered', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Active'));
    await waitFor(() => expect(mockUpdateMaterial).toHaveBeenCalledWith('m1', { isActive: false }));
  });

  it('brings a hidden one back', async () => {
    await mount([HIDDEN]);
    await fireEvent.press(screen.getByText('Hidden'));
    await waitFor(() => expect(mockUpdateMaterial).toHaveBeenCalledWith('m2', { isActive: true }));
  });

  it('reloads the list afterwards, so the screen matches the server', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Active'));
    await waitFor(() => expect(mockMaterials).toHaveBeenCalledTimes(2));
  });
});

describe('adding a material', () => {
  it('will not submit without both a code and a name', async () => {
    await mount();
    await openAddSheet();
    await fireEvent.press(await screen.findByText('Add'));
    expect(mockCreateMaterial).not.toHaveBeenCalled();
  });

  it('upper-cases the code so the list does not fill with near-duplicates', async () => {
    await mount();
    await openAddSheet();
    await fireEvent.changeText(await screen.findByPlaceholderText('MDF'), 'wpc');
    expect(screen.getByDisplayValue('WPC')).toBeTruthy();
  });

  it('trims what was typed before sending it', async () => {
    await mount();
    await openAddSheet();
    const code = screen.getByPlaceholderText('MDF');
    const name = screen.getByPlaceholderText('MDF board');
    await fireEvent.changeText(code, 'wpc ');
    await fireEvent.changeText(name, '  WPC board ');
    await fireEvent.press(screen.getByText('Add'));
    await waitFor(() =>
      expect(mockCreateMaterial).toHaveBeenCalledWith({ code: 'WPC', name: 'WPC board' }),
    );
  });

  it('clears the sheet after a save, so the next one starts empty', async () => {
    await mount();
    await openAddSheet();
    const code = screen.getByPlaceholderText('MDF');
    const name = screen.getByPlaceholderText('MDF board');
    await fireEvent.changeText(code, 'WPC');
    await fireEvent.changeText(name, 'WPC board');
    await fireEvent.press(screen.getByText('Add'));
    await waitFor(() => expect(screen.queryByDisplayValue('WPC board')).toBeNull());
  });

  it('shows the server’s refusal instead of pretending it saved', async () => {
    mockCreateMaterial.mockRejectedValue(new Error('Unique constraint failed'));
    await mount();
    await openAddSheet();
    const code = screen.getByPlaceholderText('MDF');
    const name = screen.getByPlaceholderText('MDF board');
    await fireEvent.changeText(code, 'PLY');
    await fireEvent.changeText(name, 'Plywood');
    await fireEvent.press(screen.getByText('Add'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect((Alert.alert as jest.Mock).mock.calls[0]).toEqual([
      'Failed',
      'Unique constraint failed',
    ]);
  });
});

describe('adding a thickness', () => {
  const openThicknessSheet = async () => {
    await mount();
    await fireEvent.press(screen.getByText('+ Add'));
    return screen.findByText('Thickness for Plywood');
  };

  it('names the material it will be added to', async () => {
    await openThicknessSheet();
    expect(screen.getByText('Thickness for Plywood')).toBeTruthy();
  });

  it('will not add nothing', async () => {
    await openThicknessSheet();
    await fireEvent.press(screen.getByText('Add thickness'));
    expect(mockAddThickness).not.toHaveBeenCalled();
  });

  it('says what will be stored while the value is typed', async () => {
    await openThicknessSheet();
    await fireEvent.changeText(screen.getByPlaceholderText('18'), '18');
    expect(screen.getByText('= 18 mm')).toBeTruthy();
  });

  it('stores millimetres however the shop typed it', async () => {
    await openThicknessSheet();
    await fireEvent.press(screen.getByText('in'));
    await fireEvent.changeText(screen.getByPlaceholderText('3/4'), '3/4');
    await fireEvent.press(screen.getByText('Add thickness'));
    await waitFor(() => expect(mockAddThickness).toHaveBeenCalled());
    const [id, body] = mockAddThickness.mock.calls[0];
    expect(id).toBe('m1');
    expect(body.value.unit).toBe('MM');
    expect(body.value.value).toBeCloseTo(19.05, 2);
  });

  it('keeps the inches the shop typed as the label, because that is what it is called', async () => {
    await openThicknessSheet();
    await fireEvent.press(screen.getByText('in'));
    await fireEvent.changeText(screen.getByPlaceholderText('3/4'), '3/4');
    await fireEvent.press(screen.getByText('Add thickness'));
    await waitFor(() => expect(mockAddThickness).toHaveBeenCalled());
    expect(mockAddThickness.mock.calls[0][1].label).toBe('3/4 in');
  });

  it('leaves a millimetre thickness unlabelled, since the number says it', async () => {
    await openThicknessSheet();
    await fireEvent.changeText(screen.getByPlaceholderText('18'), '18');
    await fireEvent.press(screen.getByText('Add thickness'));
    await waitFor(() => expect(mockAddThickness).toHaveBeenCalled());
    expect(mockAddThickness.mock.calls[0][1].label).toBeUndefined();
  });

  it('refuses a value it cannot read as a length', async () => {
    await openThicknessSheet();
    await fireEvent.changeText(screen.getByPlaceholderText('18'), 'thick');
    await fireEvent.press(screen.getByText('Add thickness'));
    expect(mockAddThickness).not.toHaveBeenCalled();
  });
});

describe('removing a thickness', () => {
  it('asks first, and says existing orders keep theirs', async () => {
    await mount();
    await fireEvent.press(screen.getByText('18 mm'));
    // Removing an option must not rewrite what was already punched.
    expect((Alert.alert as jest.Mock).mock.calls[0][1]).toBe('Existing orders keep theirs.');
    expect(mockRemoveThickness).not.toHaveBeenCalled();
  });

  it('removes it once that is confirmed', async () => {
    await mount();
    await fireEvent.press(screen.getByText('18 mm'));
    const [, , buttons] = (Alert.alert as jest.Mock).mock.calls[0];
    await buttons.find((b: { text: string }) => b.text === 'Remove').onPress();
    await waitFor(() => expect(mockRemoveThickness).toHaveBeenCalledWith('t1'));
  });

  it('leaves it alone when that is cancelled', async () => {
    await mount();
    await fireEvent.press(screen.getByText('18 mm'));
    const [, , buttons] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(buttons.find((b: { text: string }) => b.text === 'Cancel').onPress).toBeUndefined();
    expect(mockRemoveThickness).not.toHaveBeenCalled();
  });
});

it('goes back', async () => {
  await mount();
  await fireEvent.press(screen.getByLabelText('Back'));
  expect(goBack).toHaveBeenCalled();
});
