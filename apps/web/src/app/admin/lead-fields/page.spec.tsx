import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LeadFieldsAdminPage from './page';

const apiMock = {
  leadFields: jest.fn(),
  leadSources: jest.fn(),
  createLeadField: jest.fn(),
  updateLeadField: jest.fn(),
  deactivateLeadField: jest.fn(),
  createLeadSource: jest.fn(),
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

jest.mock('@/components/Shell', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const ARCHITECT = {
  id: 'f1',
  key: 'architect',
  label: 'Architect',
  type: 'TEXT',
  options: [],
  required: true,
  isActive: true,
};

const BUDGET = {
  id: 'f2',
  key: 'budget_band',
  label: 'Budget band',
  type: 'MULTI_SELECT',
  options: ['Under 1L', '1-5L'],
  required: false,
  isActive: false,
};

async function mount(fields: unknown[] = [ARCHITECT, BUDGET], sources: unknown[] = []) {
  apiMock.leadFields.mockResolvedValue(fields);
  apiMock.leadSources.mockResolvedValue(sources);
  render(<LeadFieldsAdminPage />);
  await screen.findByText('Lead fields');
  await waitFor(() => expect(apiMock.leadFields).toHaveBeenCalled());
}

/** The inputs on the "add a field" row, in the order they are laid out. */
const box = (index: number) =>
  Array.from(document.querySelectorAll('.card .field-row input'))[index] as HTMLInputElement;

const choose = async (label: string, option: string) => {
  const wrap = Array.from(document.querySelectorAll('.field')).find(
    (node) => node.querySelector('.field-label')?.textContent === label,
  )!;
  fireEvent.click(wrap.querySelector('.select-trigger')!);
  // The word may also appear in the table below; take the one in this list.
  const list = await screen.findByRole('listbox');
  fireEvent.click(
    Array.from(list.querySelectorAll('*')).find((node) => node.textContent === option)!,
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  apiMock.createLeadField.mockResolvedValue({});
  apiMock.updateLeadField.mockResolvedValue({});
  apiMock.deactivateLeadField.mockResolvedValue({});
  apiMock.createLeadSource.mockResolvedValue({});
});

it('asks for the hidden fields and sources too', async () => {
  await mount();
  expect(apiMock.leadFields).toHaveBeenCalledWith(true);
  expect(apiMock.leadSources).toHaveBeenCalledWith(true);
});

it('says why removing a field is safe', async () => {
  await mount();
  // Old leads stay readable, which is not obvious from the word "remove".
  expect(screen.getByText(/keeps the values already captured/)).toBeInTheDocument();
});

it('says why it could not load', async () => {
  apiMock.leadFields.mockRejectedValue(new Error('Network down'));
  apiMock.leadSources.mockResolvedValue([]);
  render(<LeadFieldsAdminPage />);
  expect(await screen.findByText('Network down')).toBeInTheDocument();
});

describe('the configured fields', () => {
  it('shows each with the key it is stored under', async () => {
    await mount();
    expect(screen.getByText('architect')).toBeInTheDocument();
    expect(screen.getByText('budget_band')).toBeInTheDocument();
  });

  it('reads the type in words rather than the database’s spelling', async () => {
    await mount();
    expect(screen.getByText('MULTI SELECT')).toBeInTheDocument();
  });

  it('lists the options a choice field offers, and a dash where there are none', async () => {
    await mount();
    expect(screen.getByText('Under 1L, 1-5L')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('says which fields must be filled in', async () => {
    await mount();
    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.getAllByText('No').length).toBeGreaterThan(0);
  });

  it('dims a field that is no longer on the form', async () => {
    await mount();
    const rows = document.querySelectorAll('tbody tr');
    expect((rows[1] as HTMLElement).style.opacity).toBe('0.45');
  });

  it('deactivates rather than deletes', async () => {
    await mount();
    fireEvent.click(screen.getByText('Remove'));
    await waitFor(() => expect(apiMock.deactivateLeadField).toHaveBeenCalledWith('f1'));
    await waitFor(() => expect(apiMock.leadFields).toHaveBeenCalledTimes(2));
  });

  it('restores one that was hidden', async () => {
    await mount();
    fireEvent.click(screen.getByText('Restore'));
    await waitFor(() =>
      expect(apiMock.updateLeadField).toHaveBeenCalledWith('f2', { isActive: true }),
    );
  });

  it('says so when nothing has been added yet', async () => {
    await mount([]);
    expect(screen.getByText('No custom fields yet.')).toBeInTheDocument();
  });
});

describe('adding a field', () => {
  it('will not add one with no label', async () => {
    await mount();
    expect(screen.getByText('Add field')).toBeDisabled();
  });

  it('generates the key from the label when none is given', async () => {
    await mount();
    fireEvent.change(box(0), { target: { value: ' Site engineer ' } });
    fireEvent.click(screen.getByText('Add field'));
    await waitFor(() => expect(apiMock.createLeadField).toHaveBeenCalled());
    const body = apiMock.createLeadField.mock.calls[0][0];
    expect(body.label).toBe('Site engineer');
    expect(body.key).toBe(' Site engineer ');
    expect(body.sortOrder).toBe(2);
  });

  it('keeps a key that was given by hand', async () => {
    await mount();
    fireEvent.change(box(0), { target: { value: 'Site engineer' } });
    fireEvent.change(box(1), { target: { value: ' site_eng ' } });
    fireEvent.click(screen.getByText('Add field'));
    await waitFor(() => expect(apiMock.createLeadField).toHaveBeenCalled());
    expect(apiMock.createLeadField.mock.calls[0][0].key).toBe('site_eng');
  });

  it('asks for options only once a choice type is picked', async () => {
    await mount();
    expect(screen.queryByPlaceholderText('Under 1L, 1-5L, 5-10L')).not.toBeInTheDocument();
    await choose('Type', 'SELECT');
    expect(screen.getByPlaceholderText('Under 1L, 1-5L, 5-10L')).toBeInTheDocument();
  });

  it('splits the options on commas and drops the empties', async () => {
    await mount();
    fireEvent.change(box(0), { target: { value: 'Budget' } });
    await choose('Type', 'SELECT');
    fireEvent.change(screen.getByPlaceholderText('Under 1L, 1-5L, 5-10L'), {
      target: { value: ' Under 1L , 1-5L ,, 5-10L ' },
    });
    fireEvent.click(screen.getByText('Add field'));
    await waitFor(() => expect(apiMock.createLeadField).toHaveBeenCalled());
    expect(apiMock.createLeadField.mock.calls[0][0].options).toEqual([
      'Under 1L',
      '1-5L',
      '5-10L',
    ]);
  });

  it('sends no options for a field that is not a choice', async () => {
    await mount();
    fireEvent.change(box(0), { target: { value: 'Site engineer' } });
    fireEvent.click(screen.getByText('Add field'));
    await waitFor(() => expect(apiMock.createLeadField).toHaveBeenCalled());
    expect(apiMock.createLeadField.mock.calls[0][0].options).toEqual([]);
  });

  it('is optional unless the admin says otherwise', async () => {
    await mount();
    fireEvent.change(box(0), { target: { value: 'Site engineer' } });
    await choose('Required', 'Yes');
    fireEvent.click(screen.getByText('Add field'));
    await waitFor(() => expect(apiMock.createLeadField).toHaveBeenCalled());
    expect(apiMock.createLeadField.mock.calls[0][0].required).toBe(true);
  });

  it('says the new field is already on the form, and empties the row', async () => {
    await mount();
    fireEvent.change(box(0), { target: { value: 'Site engineer' } });
    fireEvent.click(screen.getByText('Add field'));
    expect(
      await screen.findByText('Field added — it is already on the lead form.'),
    ).toBeInTheDocument();
    expect(box(0)).toHaveValue('');
  });

  it('shows the server’s refusal', async () => {
    apiMock.createLeadField.mockRejectedValue(new Error('Key already used'));
    await mount();
    fireEvent.change(box(0), { target: { value: 'Architect' } });
    fireEvent.click(screen.getByText('Add field'));
    expect(await screen.findByText('Key already used')).toBeInTheDocument();
  });
});

describe('lead sources', () => {
  const sourceBox = (index: number) =>
    Array.from(document.querySelectorAll('.card')).at(-1)!.querySelectorAll('input')[
      index
    ] as HTMLInputElement;

  it('lists where enquiries come from', async () => {
    await mount([ARCHITECT], [{ id: 's1', code: 'INSTAGRAM', name: 'Instagram', color: '#E1306C' }]);
    expect(screen.getByText('Instagram')).toBeInTheDocument();
  });

  it('will not add one without both a code and a name', async () => {
    await mount();
    expect(screen.getByText('Add source')).toBeDisabled();
  });

  it('upper-cases the code as it is typed', async () => {
    await mount();
    fireEvent.change(sourceBox(0), { target: { value: 'walkin' } });
    expect(sourceBox(0)).toHaveValue('WALKIN');
  });

  it('adds the source and clears the row', async () => {
    await mount();
    fireEvent.change(sourceBox(0), { target: { value: 'walkin' } });
    fireEvent.change(sourceBox(1), { target: { value: 'Walk in' } });
    fireEvent.click(screen.getByText('Add source'));
    await waitFor(() =>
      expect(apiMock.createLeadSource).toHaveBeenCalledWith({ code: 'WALKIN', name: 'Walk in' }),
    );
    await waitFor(() => expect(sourceBox(0)).toHaveValue(''));
  });
});
