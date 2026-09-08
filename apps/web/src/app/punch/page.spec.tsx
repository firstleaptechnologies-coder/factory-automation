import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PunchPage from './page';

const apiMock = {
  materials: jest.fn(),
  sizePresets: jest.fn(),
  searchClients: jest.fn(),
  punchOrder: jest.fn(),
  addAttachments: jest.fn(),
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

const PLYWOOD = {
  id: 'm1',
  name: 'Plywood',
  color: '#C08A4B',
  thicknesses: [{ id: 't1', valueMm: '18', label: null }],
};

const PRESET = {
  id: 'sp1',
  name: '8 × 4 ft sheet',
  lengthMm: '2438.4',
  widthMm: '1219.2',
};

const CLIENT = {
  id: 'c1',
  code: 'CLI-1',
  name: 'Verma Interiors',
  phone: '9820012345',
  company: null,
  locations: [{ id: 'l1', name: 'Andheri site' }],
};

/** Open the select whose label reads `label`, then click one of its options. */
const choose = async (label: string, option: string, at = 0) => {
  const triggers = Array.from(document.querySelectorAll('.field')).filter((node) =>
    node.querySelector('.field-label')?.textContent === label,
  );
  fireEvent.click(triggers[at].querySelector('.select-trigger')!);
  fireEvent.click(await screen.findByText(option));
};

const byLabel = (label: string) =>
  document.querySelector(`#${label}`) as HTMLInputElement;

/** The button, not the page title — both read "Punch order". */
const submit = () => document.querySelector('button.primary') as HTMLButtonElement;

/** The client search is debounced, so the result takes a moment to appear. */
const pickClient = async () => {
  fireEvent.change(screen.getByPlaceholderText('Type a name or phone…'), {
    target: { value: 'verma' },
  });
  fireEvent.click(await screen.findByText('Verma Interiors', {}, { timeout: 2000 }));
};

async function mount() {
  render(<PunchPage />);
  await waitFor(() => expect(apiMock.materials).toHaveBeenCalled());
  await screen.findByText('Client & site');
}

const fillOneItem = async () => {
  const lengths = document.querySelectorAll('.field input');
  await choose('Material', 'Plywood');
  const sizeInputs = Array.from(document.querySelectorAll('.field')).filter((node) =>
    ['Length', 'Width'].includes(node.querySelector('label')?.textContent ?? ''),
  );
  fireEvent.change(sizeInputs[0].querySelector('input')!, { target: { value: '8' } });
  fireEvent.change(sizeInputs[1].querySelector('input')!, { target: { value: '4' } });
  return lengths;
};

beforeEach(() => {
  jest.clearAllMocks();
  apiMock.materials.mockResolvedValue([PLYWOOD]);
  apiMock.sizePresets.mockResolvedValue([PRESET]);
  apiMock.searchClients.mockResolvedValue([CLIENT]);
  apiMock.punchOrder.mockResolvedValue({ id: 'o9' });
  apiMock.addAttachments.mockResolvedValue({});
});

it('loads the materials and sizes the shop has configured', async () => {
  await mount();
  expect(apiMock.materials).toHaveBeenCalled();
  expect(apiMock.sizePresets).toHaveBeenCalled();
});

it('says so when the configuration cannot be read', async () => {
  apiMock.materials.mockRejectedValue(new Error('Network down'));
  render(<PunchPage />);
  expect(await screen.findByText('Network down')).toBeInTheDocument();
});

it('starts with one empty line', async () => {
  await mount();
  expect(screen.getByText('LINE 1')).toBeInTheDocument();
  expect(screen.queryByText('Remove')).not.toBeInTheDocument();
});

it('adds and removes lines, but never the last one', async () => {
  await mount();
  fireEvent.click(screen.getByText('+ Add item'));
  expect(screen.getByText('LINE 2')).toBeInTheDocument();
  fireEvent.click(screen.getAllByText('Remove')[1]);
  expect(screen.queryByText('LINE 2')).not.toBeInTheDocument();
  expect(screen.queryByText('Remove')).not.toBeInTheDocument();
});

describe('what has to be filled in', () => {
  it('will not punch without a client', async () => {
    await mount();
    fireEvent.click(submit());
    expect(await screen.findByText('Pick a client or create one.')).toBeInTheDocument();
    expect(apiMock.punchOrder).not.toHaveBeenCalled();
  });

  it('will not punch without a location', async () => {
    await mount();
    await pickClient();
    fireEvent.click(submit());
    expect(await screen.findByText('Location is required.')).toBeInTheDocument();
  });

  it('will not punch a line with no material', async () => {
    await mount();
    await pickClient();
    fireEvent.change(byLabel('location'), { target: { value: 'Andheri' } });
    fireEvent.click(submit());
    expect(await screen.findByText('Every item needs a material.')).toBeInTheDocument();
  });

  it('will not punch a line whose size it cannot read', async () => {
    await mount();
    await pickClient();
    fireEvent.change(byLabel('location'), { target: { value: 'Andheri' } });
    await choose('Material', 'Plywood');
    fireEvent.click(submit());
    expect(
      await screen.findByText('Every item needs a readable length and width.'),
    ).toBeInTheDocument();
  });
});

describe('punching', () => {
  const ready = async () => {
    await mount();
    await pickClient();
    fireEvent.change(byLabel('location'), { target: { value: ' Andheri ' } });
    await fillOneItem();
  };

  it('sends every size in millimetres, whatever unit was typed in', async () => {
    await ready();
    fireEvent.click(submit());
    await waitFor(() => expect(apiMock.punchOrder).toHaveBeenCalled());
    const body = apiMock.punchOrder.mock.calls[0][0];
    // Resolved here so the server is not re-parsing free text.
    expect(body.items[0].length).toEqual({ value: 2438.4, unit: 'MM' });
    expect(body.items[0].width).toEqual({ value: 1219.2, unit: 'MM' });
  });

  it('trims the location and attaches the client that was picked', async () => {
    await ready();
    fireEvent.click(submit());
    await waitFor(() => expect(apiMock.punchOrder).toHaveBeenCalled());
    const body = apiMock.punchOrder.mock.calls[0][0];
    expect(body.location).toBe('Andheri');
    expect(body.clientId).toBe('c1');
    expect(body.newClient).toBeUndefined();
  });

  it('defaults the quantity to one', async () => {
    await ready();
    fireEvent.click(submit());
    await waitFor(() => expect(apiMock.punchOrder).toHaveBeenCalled());
    expect(apiMock.punchOrder.mock.calls[0][0].items[0].quantity).toBe(1);
  });

  it('opens the order it just created', async () => {
    await ready();
    fireEvent.click(submit());
    await waitFor(() => expect(push).toHaveBeenCalledWith('/orders/o9'));
  });

  it('says why the server refused, and lets it be tried again', async () => {
    apiMock.punchOrder.mockRejectedValue(new Error('Material is not active'));
    await ready();
    fireEvent.click(submit());
    expect(await screen.findByText('Material is not active')).toBeInTheDocument();
    expect(submit()).toBeEnabled();
  });
});

describe('a client who is not on the books yet', () => {
  it('creates one alongside the order', async () => {
    await mount();
    fireEvent.change(screen.getByPlaceholderText('Type a name or phone…'), {
      target: { value: 'Sethi Interiors' },
    });
    fireEvent.click(await screen.findByText(/Create/, {}, { timeout: 2000 }));
    fireEvent.change(screen.getByPlaceholderText('Phone'), {
      target: { value: '9820011111' },
    });
    fireEvent.change(byLabel('location'), { target: { value: 'Bandra' } });
    await fillOneItem();
    fireEvent.click(submit());
    await waitFor(() => expect(apiMock.punchOrder).toHaveBeenCalled());
    expect(apiMock.punchOrder.mock.calls[0][0].newClient).toEqual({
      name: 'Sethi Interiors',
      phone: '9820011111',
    });
  });

  it('warns that a known number attaches to the existing client', async () => {
    await mount();
    fireEvent.change(screen.getByPlaceholderText('Type a name or phone…'), {
      target: { value: 'Sethi' },
    });
    fireEvent.click(await screen.findByText(/Create/, {}, { timeout: 2000 }));
    // Otherwise the shop ends up with two records for one person.
    expect(screen.getByText(/instead of creating a duplicate/)).toBeInTheDocument();
  });
});

describe('sizes', () => {
  it('fills a line from a preset, shown in the unit being typed in', async () => {
    await mount();
    await choose('Size preset', '8 × 4 ft sheet');
    const inputs = Array.from(document.querySelectorAll('.field')).filter((node) =>
      ['Length', 'Width'].includes(node.querySelector('label')?.textContent ?? ''),
    );
    // Stored as 2438.4mm; shown as 8ft because that is what will be saved.
    expect(inputs[0].querySelector('input')).toHaveValue('8');
    expect(inputs[1].querySelector('input')).toHaveValue('4');
  });

  it('detaches the preset once a size is typed over', async () => {
    await mount();
    await choose('Size preset', '8 × 4 ft sheet');
    const inputs = Array.from(document.querySelectorAll('.field')).filter((node) =>
      ['Length', 'Width'].includes(node.querySelector('label')?.textContent ?? ''),
    );
    fireEvent.change(inputs[0].querySelector('input')!, { target: { value: '6' } });
    expect(screen.getAllByText('Custom size').length).toBeGreaterThan(0);
  });

  it('switches every line to the default unit that was chosen', async () => {
    await mount();
    fireEvent.click(screen.getByText('mm'));
    await pickClient();
    fireEvent.change(byLabel('location'), { target: { value: 'Andheri' } });
    await choose('Material', 'Plywood');
    const inputs = Array.from(document.querySelectorAll('.field')).filter((node) =>
      ['Length', 'Width'].includes(node.querySelector('label')?.textContent ?? ''),
    );
    fireEvent.change(inputs[0].querySelector('input')!, { target: { value: '2438.4' } });
    fireEvent.change(inputs[1].querySelector('input')!, { target: { value: '1219.2' } });
    fireEvent.click(submit());
    await waitFor(() => expect(apiMock.punchOrder).toHaveBeenCalled());
    expect(apiMock.punchOrder.mock.calls[0][0].items[0].length.value).toBeCloseTo(2438.4, 1);
  });
});

describe('thickness', () => {
  it('cannot be chosen before a material is', async () => {
    await mount();
    expect(screen.getByText('Pick a material first')).toBeInTheDocument();
  });

  it('offers what the material was configured with', async () => {
    await mount();
    await choose('Material', 'Plywood');
    await choose('Thickness', '18 mm');
    expect(screen.getAllByText('18 mm').length).toBeGreaterThan(0);
  });

  it('takes a custom thickness in millimetres when none is picked', async () => {
    await mount();
    await pickClient();
    fireEvent.change(byLabel('location'), { target: { value: 'Andheri' } });
    await fillOneItem();
    const custom = Array.from(document.querySelectorAll('.field')).find((node) =>
      node.querySelector('label')?.textContent?.startsWith('Custom thickness'),
    )!;
    fireEvent.change(custom.querySelector('input')!, { target: { value: '19' } });
    fireEvent.click(submit());
    await waitFor(() => expect(apiMock.punchOrder).toHaveBeenCalled());
    expect(apiMock.punchOrder.mock.calls[0][0].items[0].thickness).toEqual({
      value: 19,
      unit: 'MM',
    });
  });

  it('sends no thickness at all when none was given', async () => {
    await mount();
    await pickClient();
    fireEvent.change(byLabel('location'), { target: { value: 'Andheri' } });
    await fillOneItem();
    fireEvent.click(submit());
    await waitFor(() => expect(apiMock.punchOrder).toHaveBeenCalled());
    expect(apiMock.punchOrder.mock.calls[0][0].items[0].thickness).toBeUndefined();
  });
});

describe('the site', () => {
  it('offers the client’s known locations once one is picked', async () => {
    await mount();
    await pickClient();
    await waitFor(() =>
      expect(document.querySelector('#known-locations option')).toHaveValue('Andheri site'),
    );
  });
});
