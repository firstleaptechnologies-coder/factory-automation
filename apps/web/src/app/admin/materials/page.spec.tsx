import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MaterialsAdminPage from './page';

const apiMock = {
  materials: jest.fn(),
  createMaterial: jest.fn(),
  addThickness: jest.fn(),
  removeThickness: jest.fn(),
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

async function mount(rows: unknown[] = [PLYWOOD]) {
  apiMock.materials.mockResolvedValue(rows);
  render(<MaterialsAdminPage />);
  await screen.findByText('Materials');
  await waitFor(() => expect(apiMock.materials).toHaveBeenCalled());
}

const byId = (id: string) => document.querySelector(`#${id}`) as HTMLInputElement;

beforeEach(() => {
  jest.clearAllMocks();
  apiMock.createMaterial.mockResolvedValue({});
  apiMock.addThickness.mockResolvedValue({});
  apiMock.removeThickness.mockResolvedValue({});
});

it('asks for the hidden materials too, since this is where they come back', async () => {
  await mount();
  expect(apiMock.materials).toHaveBeenCalledWith(true);
});

it('shows each material with its code and thicknesses', async () => {
  await mount();
  expect(screen.getByText('PLY')).toBeInTheDocument();
  expect(screen.getByText('Plywood')).toBeInTheDocument();
  expect(screen.getByText('18 mm ×')).toBeInTheDocument();
});

it('prefers the label a thickness was given over the raw millimetres', async () => {
  await mount();
  expect(screen.getByText('3/4 in ×')).toBeInTheDocument();
  expect(screen.queryByText('19.05 mm ×')).not.toBeInTheDocument();
});

it('says so when a material has no thicknesses', async () => {
  await mount([HIDDEN]);
  expect(screen.getByText('None')).toBeInTheDocument();
});

it('dims a material that is no longer offered rather than hiding it', async () => {
  await mount([PLYWOOD, HIDDEN]);
  const rows = document.querySelectorAll('tbody tr');
  expect((rows[0] as HTMLElement).style.opacity).toBe('1');
  expect((rows[1] as HTMLElement).style.opacity).toBe('0.5');
});

describe('adding a material', () => {
  it('will not add one without both a code and a name', async () => {
    await mount();
    // The first "Add" is the material's; the rest add thicknesses to rows.
    expect(screen.getAllByText('Add')[0]).toBeDisabled();
  });

  it('upper-cases the code so the list does not fill with near-duplicates', async () => {
    await mount();
    fireEvent.change(byId('code'), { target: { value: 'wpc' } });
    expect(byId('code')).toHaveValue('WPC');
  });

  it('adds it and clears the form', async () => {
    await mount();
    fireEvent.change(byId('code'), { target: { value: 'wpc' } });
    fireEvent.change(byId('name'), { target: { value: 'WPC board' } });
    fireEvent.click(screen.getAllByText('Add')[0]);
    await waitFor(() =>
      expect(apiMock.createMaterial).toHaveBeenCalledWith({ code: 'WPC', name: 'WPC board' }),
    );
    await waitFor(() => expect(byId('code')).toHaveValue(''));
  });

  it('re-reads the list afterwards', async () => {
    await mount();
    fireEvent.change(byId('code'), { target: { value: 'WPC' } });
    fireEvent.change(byId('name'), { target: { value: 'WPC board' } });
    fireEvent.click(screen.getAllByText('Add')[0]);
    await waitFor(() => expect(apiMock.materials).toHaveBeenCalledTimes(2));
  });

  it('shows the server’s refusal', async () => {
    apiMock.createMaterial.mockRejectedValue(new Error('Unique constraint failed'));
    await mount();
    fireEvent.change(byId('code'), { target: { value: 'PLY' } });
    fireEvent.change(byId('name'), { target: { value: 'Plywood' } });
    fireEvent.click(screen.getAllByText('Add')[0]);
    expect(await screen.findByText('Unique constraint failed')).toBeInTheDocument();
  });

  it('says why the list itself could not be read', async () => {
    apiMock.materials.mockRejectedValue(new Error('Network down'));
    render(<MaterialsAdminPage />);
    expect(await screen.findByText('Network down')).toBeInTheDocument();
  });
});

describe('thicknesses', () => {
  const thicknessBox = () =>
    Array.from(document.querySelectorAll('tbody input')).at(0) as HTMLInputElement;
  const addThickness = () =>
    fireEvent.click(Array.from(document.querySelectorAll('tbody button')).at(-1)!);

  it('stores millimetres however the shop typed it', async () => {
    await mount();
    fireEvent.click(screen.getByText('in'));
    fireEvent.change(thicknessBox(), { target: { value: '3/4' } });
    addThickness();
    await waitFor(() => expect(apiMock.addThickness).toHaveBeenCalled());
    const [id, body] = apiMock.addThickness.mock.calls[0];
    expect(id).toBe('m1');
    expect(body.value.unit).toBe('MM');
    expect(body.value.value).toBeCloseTo(19.05, 2);
    // The shop calls it 3/4 in, so that is what the chip should read.
    expect(body.label).toBe('3/4 in');
  });

  it('leaves a millimetre thickness unlabelled, since the number says it', async () => {
    await mount();
    fireEvent.change(thicknessBox(), { target: { value: '18' } });
    addThickness();
    await waitFor(() => expect(apiMock.addThickness).toHaveBeenCalled());
    expect(apiMock.addThickness.mock.calls[0][1].label).toBeUndefined();
  });

  it('says so when it cannot read what was typed as a thickness', async () => {
    await mount();
    fireEvent.change(thicknessBox(), { target: { value: 'thick' } });
    addThickness();
    expect(await screen.findByText('Could not read "thick" as a thickness')).toBeInTheDocument();
    expect(apiMock.addThickness).not.toHaveBeenCalled();
  });

  it('empties the box after one is added', async () => {
    await mount();
    fireEvent.change(thicknessBox(), { target: { value: '18' } });
    addThickness();
    await waitFor(() => expect(thicknessBox()).toHaveValue(''));
  });

  it('removes one that is clicked', async () => {
    await mount();
    fireEvent.click(screen.getByText('18 mm ×'));
    await waitFor(() => expect(apiMock.removeThickness).toHaveBeenCalledWith('t1'));
    await waitFor(() => expect(apiMock.materials).toHaveBeenCalledTimes(2));
  });

  it('offers only the units a sheet is ever measured in', async () => {
    await mount();
    expect(screen.getByText('mm')).toBeInTheDocument();
    expect(screen.getByText('in')).toBeInTheDocument();
    expect(screen.queryByText('ft')).not.toBeInTheDocument();
  });
});
