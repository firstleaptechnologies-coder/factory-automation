import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AdminLeadFieldsScreen } from './AdminLeadFieldsScreen';

const mockLeadFields = jest.fn();
const mockLeadSources = jest.fn();
const mockCreateLeadField = jest.fn();
const mockUpdateLeadField = jest.fn();
const mockDeactivateLeadField = jest.fn();
const mockCreateLeadSource = jest.fn();
jest.mock('../../api/client', () => ({
  api: {
    leadFields: (...a: unknown[]) => mockLeadFields(...a),
    leadSources: (...a: unknown[]) => mockLeadSources(...a),
    createLeadField: (...a: unknown[]) => mockCreateLeadField(...a),
    updateLeadField: (...a: unknown[]) => mockUpdateLeadField(...a),
    deactivateLeadField: (...a: unknown[]) => mockDeactivateLeadField(...a),
    createLeadSource: (...a: unknown[]) => mockCreateLeadSource(...a),
  },
}));

const ARCHITECT = {
  id: 'f1',
  key: 'architect',
  label: 'Architect',
  type: 'TEXT',
  options: [],
  required: true,
  isActive: true,
  sortOrder: 0,
};

const BUDGET = {
  id: 'f2',
  key: 'budget_band',
  label: 'Budget band',
  type: 'MULTI_SELECT',
  options: ['Under 1L', '1-5L'],
  required: false,
  isActive: false,
  sortOrder: 1,
};

const SOURCE = { id: 's1', code: 'INSTAGRAM', name: 'Instagram', color: '#E1306C', isActive: true };

const goBack = jest.fn();

async function mount(fields: unknown[] = [ARCHITECT, BUDGET], sources: unknown[] = [SOURCE]) {
  mockLeadFields.mockResolvedValue(fields);
  mockLeadSources.mockResolvedValue(sources);
  await render(<AdminLeadFieldsScreen navigation={{ goBack }} />);
  await screen.findByText('Lead capture');
}

const openFieldSheet = () => fireEvent.press(screen.getByText('Add field'));
/** The sheet's submit repeats the words on the button that opened it. */
const submitField = () => fireEvent.press(screen.getAllByText('Add field').at(-1)!);

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateLeadField.mockResolvedValue({});
  mockUpdateLeadField.mockResolvedValue({});
  mockDeactivateLeadField.mockResolvedValue({});
  mockCreateLeadSource.mockResolvedValue({});
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

it('waits for both lists before drawing either', async () => {
  mockLeadFields.mockResolvedValue([]);
  mockLeadSources.mockReturnValue(new Promise(() => {}));
  await render(<AdminLeadFieldsScreen navigation={{ goBack }} />);
  expect(screen.queryByText('Lead capture')).toBeNull();
});

it('asks for the hidden fields and sources too', async () => {
  await mount();
  expect(mockLeadFields).toHaveBeenCalledWith(true);
  expect(mockLeadSources).toHaveBeenCalledWith(true);
});

it('says that hiding a field keeps what was already captured', async () => {
  await mount();
  // Otherwise an admin has no way to know whether tidying the form destroys
  // the enquiries already taken on it.
  expect(screen.getByText(/keeps what\s+was already captured/)).toBeTruthy();
});

describe('the field list', () => {
  it('shows each field with the key it will be stored under', async () => {
    await mount();
    expect(screen.getByText('architect')).toBeTruthy();
    expect(screen.getByText('budget_band')).toBeTruthy();
  });

  it('marks a required field with a star', async () => {
    await mount();
    expect(screen.getByText('Architect *')).toBeTruthy();
    expect(screen.getByText('Budget band')).toBeTruthy();
  });

  it('reads the type back in words rather than in the database’s spelling', async () => {
    await mount();
    expect(screen.getByText('multi select')).toBeTruthy();
    expect(screen.getByText('text')).toBeTruthy();
  });

  it('lists the options a select offers, and a dash where there are none', async () => {
    await mount();
    expect(screen.getByText('Under 1L, 1-5L')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('says so when nothing has been added yet', async () => {
    await mount([]);
    expect(screen.getByText('No custom fields yet')).toBeTruthy();
  });

  it('offers to hide a live field and to restore a hidden one', async () => {
    await mount();
    expect(screen.getByText('Hide')).toBeTruthy();
    expect(screen.getByText('Restore')).toBeTruthy();
  });

  it('deactivates rather than deletes, so captured values survive', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Hide'));
    await waitFor(() => expect(mockDeactivateLeadField).toHaveBeenCalledWith('f1'));
  });

  it('brings a hidden field back', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Restore'));
    await waitFor(() => expect(mockUpdateLeadField).toHaveBeenCalledWith('f2', { isActive: true }));
  });

  it('reloads both lists after a change', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Hide'));
    await waitFor(() => expect(mockLeadFields).toHaveBeenCalledTimes(2));
    expect(mockLeadSources).toHaveBeenCalledTimes(2);
  });
});

describe('adding a field', () => {
  it('will not add a field with no label', async () => {
    await mount();
    await openFieldSheet();
    await submitField();
    expect(mockCreateLeadField).not.toHaveBeenCalled();
  });

  it('sends the label as the key and lets the server make it safe', async () => {
    await mount();
    await openFieldSheet();
    await fireEvent.changeText(await screen.findByPlaceholderText('e.g. Architect'), ' Site engineer ');
    await submitField();
    await waitFor(() => expect(mockCreateLeadField).toHaveBeenCalled());
    const body = mockCreateLeadField.mock.calls[0][0];
    expect(body.label).toBe('Site engineer');
    expect(body.key).toBe(' Site engineer ');
    expect(body.type).toBe('TEXT');
  });

  it('puts a new field at the end of the form', async () => {
    await mount();
    await openFieldSheet();
    await fireEvent.changeText(await screen.findByPlaceholderText('e.g. Architect'), 'Site engineer');
    await submitField();
    await waitFor(() => expect(mockCreateLeadField).toHaveBeenCalled());
    expect(mockCreateLeadField.mock.calls[0][0].sortOrder).toBe(2);
  });

  it('asks for options only once a choice field is picked', async () => {
    await mount();
    await openFieldSheet();
    expect(screen.queryByPlaceholderText('Under 1L, 1-5L, 5-10L')).toBeNull();
    await fireEvent.press(screen.getAllByText('select').at(-1)!);
    expect(screen.getByPlaceholderText('Under 1L, 1-5L, 5-10L')).toBeTruthy();
  });

  it('will not add a choice field with nothing to choose from', async () => {
    await mount();
    await openFieldSheet();
    await fireEvent.changeText(await screen.findByPlaceholderText('e.g. Architect'), 'Budget');
    await fireEvent.press(screen.getAllByText('select').at(-1)!);
    await submitField();
    expect(mockCreateLeadField).not.toHaveBeenCalled();
  });

  it('splits the options on commas and drops the empties', async () => {
    await mount();
    await openFieldSheet();
    await fireEvent.changeText(await screen.findByPlaceholderText('e.g. Architect'), 'Budget');
    await fireEvent.press(screen.getAllByText('select').at(-1)!);
    await fireEvent.changeText(
      screen.getByPlaceholderText('Under 1L, 1-5L, 5-10L'),
      ' Under 1L , 1-5L ,, 5-10L ',
    );
    await submitField();
    await waitFor(() => expect(mockCreateLeadField).toHaveBeenCalled());
    expect(mockCreateLeadField.mock.calls[0][0].options).toEqual(['Under 1L', '1-5L', '5-10L']);
  });

  it('sends no options for a field that is not a choice', async () => {
    await mount();
    await openFieldSheet();
    await fireEvent.changeText(await screen.findByPlaceholderText('e.g. Architect'), 'Site engineer');
    await submitField();
    await waitFor(() => expect(mockCreateLeadField).toHaveBeenCalled());
    expect(mockCreateLeadField.mock.calls[0][0].options).toEqual([]);
  });

  it('is optional unless the admin says otherwise', async () => {
    await mount();
    await openFieldSheet();
    await fireEvent.changeText(await screen.findByPlaceholderText('e.g. Architect'), 'Site engineer');
    await fireEvent.press(screen.getByText('Yes'));
    await submitField();
    await waitFor(() => expect(mockCreateLeadField).toHaveBeenCalled());
    expect(mockCreateLeadField.mock.calls[0][0].required).toBe(true);
  });

  it('empties the sheet after a save', async () => {
    await mount();
    await openFieldSheet();
    await fireEvent.changeText(await screen.findByPlaceholderText('e.g. Architect'), 'Site engineer');
    await submitField();
    await waitFor(() => expect(screen.queryByDisplayValue('Site engineer')).toBeNull());
  });

  it('shows the server’s refusal', async () => {
    mockCreateLeadField.mockRejectedValue(new Error('Key already used'));
    await mount();
    await openFieldSheet();
    await fireEvent.changeText(await screen.findByPlaceholderText('e.g. Architect'), 'Architect');
    await submitField();
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Failed', 'Key already used'));
  });
});

describe('sources', () => {
  it('lists where enquiries come from', async () => {
    await mount();
    expect(screen.getByText('Instagram')).toBeTruthy();
  });

  it('will not add one without both a code and a name', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Add'));
    await fireEvent.press(await screen.findByText('Add source'));
    expect(mockCreateLeadSource).not.toHaveBeenCalled();
  });

  it('makes the code a safe identifier as it is typed', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Add'));
    await fireEvent.changeText(await screen.findByPlaceholderText('INSTAGRAM'), 'walk in');
    // Spaces in a code make it awkward to filter on later.
    expect(screen.getByDisplayValue('WALK_IN')).toBeTruthy();
  });

  it('adds the source', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Add'));
    await fireEvent.changeText(await screen.findByPlaceholderText('INSTAGRAM'), 'walk in');
    await fireEvent.changeText(screen.getByPlaceholderText('Instagram'), 'Walk in');
    await fireEvent.press(screen.getByText('Add source'));
    await waitFor(() =>
      expect(mockCreateLeadSource).toHaveBeenCalledWith({ code: 'WALK_IN', name: 'Walk in' }),
    );
  });
});

it('goes back', async () => {
  await mount();
  await fireEvent.press(screen.getByLabelText('Back'));
  expect(goBack).toHaveBeenCalled();
});
