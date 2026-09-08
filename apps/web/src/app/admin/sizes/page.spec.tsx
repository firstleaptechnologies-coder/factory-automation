import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SizesAdminPage from './page';

const apiMock = { sizePresets: jest.fn(), createSizePreset: jest.fn() };
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
  apiMock.sizePresets.mockResolvedValue(rows);
  render(<SizesAdminPage />);
  await screen.findByText('Sizes');
  await waitFor(() => expect(apiMock.sizePresets).toHaveBeenCalled());
}

/** The form's inputs, in the order they are laid out. */
const box = (index: number) =>
  Array.from(document.querySelectorAll('.field-row input'))[index] as HTMLInputElement;

const fill = (code: string, name: string, length: string, width: string, thickness?: string) => {
  fireEvent.change(box(0), { target: { value: code } });
  fireEvent.change(box(1), { target: { value: name } });
  fireEvent.change(box(2), { target: { value: length } });
  fireEvent.change(box(3), { target: { value: width } });
  if (thickness !== undefined) fireEvent.change(box(4), { target: { value: thickness } });
};

beforeEach(() => {
  jest.clearAllMocks();
  apiMock.createSizePreset.mockResolvedValue({});
});

it('asks for the deactivated presets too', async () => {
  await mount();
  expect(apiMock.sizePresets).toHaveBeenCalledWith(true);
});

it('says that anything typed is stored in millimetres', async () => {
  await mount();
  expect(
    screen.getByText(/Type in any unit — everything is stored in millimetres/),
  ).toBeInTheDocument();
});

it('shows each preset in the unit being read, and what is stored underneath', async () => {
  await mount();
  expect(screen.getByText('SHEET-8X4')).toBeInTheDocument();
  expect(screen.getByText('8 ft')).toBeInTheDocument();
  expect(screen.getByText('4 ft')).toBeInTheDocument();
  expect(screen.getByText('2438.4 × 1219.2 mm')).toBeInTheDocument();
});

it('re-reads the same preset in another unit without asking the server again', async () => {
  await mount();
  fireEvent.click(screen.getByText('mm'));
  expect(screen.getByText('2438.4 mm')).toBeInTheDocument();
  expect(apiMock.sizePresets).toHaveBeenCalledTimes(1);
});

it('draws a dash where a preset has no thickness', async () => {
  await mount();
  expect(screen.getByText('—')).toBeInTheDocument();
});

it('shows the thickness when one was set, always in millimetres', async () => {
  await mount([{ ...PRESET, thicknessMm: '18' }]);
  expect(screen.getByText('18 mm')).toBeInTheDocument();
});

it('dims a preset that is no longer offered', async () => {
  await mount([{ ...PRESET, isActive: false }]);
  expect((document.querySelector('tbody tr') as HTMLElement).style.opacity).toBe('0.5');
});

describe('adding a preset', () => {
  it('will not add one without a code and a name', async () => {
    await mount();
    expect(screen.getByText('Add')).toBeDisabled();
  });

  it('upper-cases the code as it is typed', async () => {
    await mount();
    fireEvent.change(box(0), { target: { value: 'sheet-6x4' } });
    expect(box(0)).toHaveValue('SHEET-6X4');
  });

  it('stores every dimension in millimetres, whatever unit was typed in', async () => {
    await mount();
    fill('SHEET-6X4', '6 × 4 ft sheet', '6', '4');
    fireEvent.click(screen.getByText('Add'));
    await waitFor(() => expect(apiMock.createSizePreset).toHaveBeenCalled());
    const body = apiMock.createSizePreset.mock.calls[0][0];
    expect(body.length.value).toBeCloseTo(1828.8, 1);
    expect(body.width.value).toBeCloseTo(1219.2, 1);
    expect(body.length.unit).toBe('MM');
  });

  it('reads the sizes in whichever unit is selected', async () => {
    await mount();
    fireEvent.click(screen.getByText('mm'));
    fill('A', 'A', '2438.4', '1219.2');
    fireEvent.click(screen.getByText('Add'));
    await waitFor(() => expect(apiMock.createSizePreset).toHaveBeenCalled());
    expect(apiMock.createSizePreset.mock.calls[0][0].length.value).toBeCloseTo(2438.4, 1);
  });

  it('always reads the thickness in millimetres, whatever the sizes are in', async () => {
    await mount();
    fill('A', 'A', '8', '4', '18');
    fireEvent.click(screen.getByText('Add'));
    await waitFor(() => expect(apiMock.createSizePreset).toHaveBeenCalled());
    expect(apiMock.createSizePreset.mock.calls[0][0].thickness).toEqual({
      value: 18,
      unit: 'MM',
    });
  });

  it('leaves thickness off entirely when none was given', async () => {
    await mount();
    fill('A', 'A', '8', '4');
    fireEvent.click(screen.getByText('Add'));
    await waitFor(() => expect(apiMock.createSizePreset).toHaveBeenCalled());
    expect(apiMock.createSizePreset.mock.calls[0][0].thickness).toBeUndefined();
  });

  it('refuses a size it cannot read rather than sending nonsense', async () => {
    await mount();
    fill('A', 'A', 'big', '4');
    fireEvent.click(screen.getByText('Add'));
    expect(
      await screen.findByText('Length and width must be readable sizes.'),
    ).toBeInTheDocument();
    expect(apiMock.createSizePreset).not.toHaveBeenCalled();
  });

  it('empties the form and re-reads the list after saving', async () => {
    await mount();
    fill('A', 'A', '8', '4');
    fireEvent.click(screen.getByText('Add'));
    await waitFor(() => expect(apiMock.sizePresets).toHaveBeenCalledTimes(2));
    expect(box(0)).toHaveValue('');
  });

  it('shows the server’s refusal', async () => {
    apiMock.createSizePreset.mockRejectedValue(new Error('Unique constraint failed'));
    await mount();
    fill('SHEET-8X4', 'Duplicate', '8', '4');
    fireEvent.click(screen.getByText('Add'));
    expect(await screen.findByText('Unique constraint failed')).toBeInTheDocument();
  });

  it('says why the list itself could not be read', async () => {
    apiMock.sizePresets.mockRejectedValue(new Error('Network down'));
    render(<SizesAdminPage />);
    expect(await screen.findByText('Network down')).toBeInTheDocument();
  });
});
