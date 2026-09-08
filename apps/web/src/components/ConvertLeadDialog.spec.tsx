import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConvertLeadDialog } from './ConvertLeadDialog';

const convertLead = jest.fn();
jest.mock('@/lib/api', () => ({
  api: { convertLead: (...args: unknown[]) => convertLead(...args) },
}));

const MATERIALS = [
  {
    id: 'm1',
    name: 'MDF',
    color: '#B98B54',
    thicknesses: [{ id: 't1', valueMm: 18, label: '18mm' }],
  },
  { id: 'm2', name: 'Plywood', color: null, thicknesses: [{ id: 't2', valueMm: 12, label: null }] },
];

const LEAD = {
  id: 'l1',
  code: 'LEAD-1',
  title: 'Kitchen jali',
  location: 'Andheri',
  contactName: 'Verma',
  client: null,
};

function mount(lead: Record<string, unknown> = {}) {
  const onClose = jest.fn();
  const onConverted = jest.fn();
  const view = render(
    <ConvertLeadDialog
      lead={{ ...LEAD, ...lead } as never}
      materials={MATERIALS as never}
      onClose={onClose}
      onConverted={onConverted}
    />,
  );
  return { onClose, onConverted, view };
}

const submit = () => fireEvent.click(screen.getByText('Convert to order'));

function fillLine(view: ReturnType<typeof mount>['view'], length = '8', width = '4') {
  const inputs = view.container.querySelectorAll('.item-card input');
  fireEvent.change(inputs[0], { target: { value: length } });
  fireEvent.change(inputs[1], { target: { value: width } });
  fireEvent.click(view.container.querySelectorAll('.select-trigger')[0]);
  fireEvent.click(screen.getByRole('option', { name: 'MDF' }));
}

beforeEach(() => {
  convertLead.mockReset().mockResolvedValue({ order: { id: 'o1', code: 'ORD-1' } });
});

it('names the lead it is converting', () => {
  mount();
  expect(screen.getByText('Convert LEAD-1')).toBeInTheDocument();
});

it('says a client will be created for a loose enquiry', () => {
  mount();
  expect(screen.getByText(/a client will be created/)).toBeInTheDocument();
});

it('says the existing client will be reused', () => {
  mount({ client: { id: 'c1', name: 'Verma Interiors' } });
  expect(screen.getByText(/existing client/)).toBeInTheDocument();
});

it('starts from the location the lead already recorded', () => {
  mount();
  expect(screen.getByLabelText('Location')).toHaveValue('Andheri');
});

it('refuses to convert without a location', () => {
  mount({ location: null });
  submit();
  expect(screen.getByText('Location is required.')).toBeInTheDocument();
  expect(convertLead).not.toHaveBeenCalled();
});

it('refuses a line with no readable size', () => {
  mount();
  submit();
  // A lead records an enquiry, not dimensions — this is where they arrive.
  expect(screen.getByText('Every item needs a readable length and width.')).toBeInTheDocument();
  expect(convertLead).not.toHaveBeenCalled();
});

it('refuses a line with no material', () => {
  const { view } = mount();
  const inputs = view.container.querySelectorAll('.item-card input');
  fireEvent.change(inputs[0], { target: { value: '8' } });
  fireEvent.change(inputs[1], { target: { value: '4' } });
  submit();
  expect(screen.getByText('Every item needs a material.')).toBeInTheDocument();
});

it('converts the sizes to millimetres before sending them', async () => {
  const view = mount();
  fillLine(view.view);
  submit();
  await waitFor(() => expect(convertLead).toHaveBeenCalled());
  expect(convertLead.mock.calls[0][1]).toMatchObject({
    location: 'Andheri',
    items: [
      {
        length: { value: 2438.4, unit: 'MM' },
        width: { value: 1219.2, unit: 'MM' },
        materialId: 'm1',
        quantity: 1,
      },
    ],
  });
});

it('reads a measurement typed with its own unit', async () => {
  const view = mount();
  fillLine(view.view, '2440mm', '1220mm');
  submit();
  await waitFor(() => expect(convertLead).toHaveBeenCalled());
  expect(convertLead.mock.calls[0][1].items[0].length).toEqual({ value: 2440, unit: 'MM' });
});

it('sends no thickness rather than an empty one', async () => {
  const view = mount();
  fillLine(view.view);
  submit();
  await waitFor(() => expect(convertLead).toHaveBeenCalled());
  expect(convertLead.mock.calls[0][1].items[0].materialThicknessId).toBeUndefined();
});

it('offers only the chosen material’s thicknesses', () => {
  const { view } = mount();
  fillLine(view);
  fireEvent.click(view.container.querySelectorAll('.select-trigger')[1]);
  expect(screen.getByRole('option', { name: '18mm' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: /12 mm/ })).not.toBeInTheDocument();
});

it('clears the thickness when the material changes under it', () => {
  const { view } = mount();
  fillLine(view);
  fireEvent.click(view.container.querySelectorAll('.select-trigger')[1]);
  fireEvent.click(screen.getByRole('option', { name: '18mm' }));

  fireEvent.click(view.container.querySelectorAll('.select-trigger')[0]);
  fireEvent.click(screen.getByRole('option', { name: 'Plywood' }));
  // An 18mm MDF option left selected on a plywood line would be nonsense.
  expect(view.container.querySelectorAll('.select-trigger')[1].textContent).toContain('—');
});

it('labels a thickness with no label by its measurement', () => {
  const { view } = mount();
  fireEvent.click(view.container.querySelectorAll('.select-trigger')[0]);
  fireEvent.click(screen.getByRole('option', { name: 'Plywood' }));
  fireEvent.click(view.container.querySelectorAll('.select-trigger')[1]);
  expect(screen.getByRole('option', { name: '12 mm' })).toBeInTheDocument();
});

it('cannot remove the only line', () => {
  mount();
  expect(screen.queryByText('Remove')).not.toBeInTheDocument();
});

it('adds and removes lines', () => {
  const { view } = mount();
  fireEvent.click(screen.getByText('+ Add item'));
  expect(view.container.querySelectorAll('.item-card')).toHaveLength(2);
  fireEvent.click(screen.getAllByText('Remove')[0]);
  expect(view.container.querySelectorAll('.item-card')).toHaveLength(1);
});

it('switches every line to another unit at once', () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'mm' }));
  expect(screen.getByText('Length (mm)')).toBeInTheDocument();
});

it('hands the new order back to the caller', async () => {
  const view = mount();
  fillLine(view.view);
  submit();
  await waitFor(() =>
    expect(view.onConverted).toHaveBeenCalledWith({ id: 'o1', code: 'ORD-1' }),
  );
});

it('shows the server’s refusal and lets the user try again', async () => {
  convertLead.mockRejectedValue(new Error('LEAD-1 was already converted into ORD-9'));
  const view = mount();
  fillLine(view.view);
  submit();
  expect(await screen.findByText('LEAD-1 was already converted into ORD-9')).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByText('Convert to order')).not.toBeDisabled(),
  );
});

it('cannot be submitted twice while it is working', async () => {
  let release: (value: unknown) => void = () => {};
  convertLead.mockImplementation(() => new Promise((r) => (release = r)));
  const view = mount();
  fillLine(view.view);
  submit();
  expect(await screen.findByText('Converting…')).toBeDisabled();
  release({ order: { id: 'o1' } });
  await waitFor(() => expect(convertLead).toHaveBeenCalledTimes(1));
});

it('closes on Cancel', () => {
  const { onClose } = mount();
  fireEvent.click(screen.getByText('Cancel'));
  expect(onClose).toHaveBeenCalled();
});

it('closes on a click outside but not on one inside', () => {
  const { onClose, view } = mount();
  fireEvent.click(screen.getByText('Convert LEAD-1'));
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.click(view.container.querySelector('.modal-backdrop')!);
  expect(onClose).toHaveBeenCalledTimes(1);
});
