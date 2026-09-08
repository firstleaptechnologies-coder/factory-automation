import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { PurchaseEditScreen, lineAmount } from './PurchaseEditScreen';

const mockVendors = jest.fn();
const mockMaterials = jest.fn();
const mockPurchase = jest.fn();
const mockCreate = jest.fn();
jest.mock('../api/client', () => ({
  api: {
    vendors: (...a: unknown[]) => mockVendors(...a),
    materials: (...a: unknown[]) => mockMaterials(...a),
    purchase: (...a: unknown[]) => mockPurchase(...a),
    createPurchase: (...a: unknown[]) => mockCreate(...a),
    updatePurchase: jest.fn(),
  },
}));

const navigation = { goBack: jest.fn(), replace: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockVendors.mockResolvedValue({
    data: [{ id: 'v1', code: 'VEN-0001', name: 'Verma Boards', isActive: true }],
    meta: { page: 1, pages: 1, total: 1, limit: 200 },
  });
  mockMaterials.mockResolvedValue([
    {
      id: 'm1',
      code: 'PLY',
      name: 'Plywood',
      thicknesses: [{ id: 't1', valueMm: 18, label: null, isActive: true }],
    },
  ]);
  mockCreate.mockResolvedValue({ id: 'p9' });
});

const mount = async () => {
  await render(
    <PurchaseEditScreen navigation={navigation as never} route={{ params: {} } as never} />,
  );
  await waitFor(() => expect(mockVendors).toHaveBeenCalled());
};

it('works out what a line comes to, tax and all', () => {
  // The tax is typed rather than derived: a vendor's arithmetic is what is
  // owed, whatever this would have calculated.
  expect(lineAmount({ quantity: '10', rate: '900', taxAmount: '1620' } as never)).toBe(10620);
  expect(lineAmount({ quantity: '', rate: '', taxAmount: '' } as never)).toBe(0);
});

it('will not write an order with no vendor or no line', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Write it'));
  expect(mockCreate).not.toHaveBeenCalled();
});

it('sends the lines somebody filled in', async () => {
  await mount();
  const selects = screen.getAllByTestId('select-trigger');
  await fireEvent(selects[0], 'touchEnd');
  await fireEvent.press(await screen.findByText('Verma Boards · VEN-0001'));

  await fireEvent(screen.getAllByTestId('select-trigger')[1], 'touchEnd');
  const options = await screen.findAllByText('Plywood');
  await fireEvent.press(options[options.length - 1]);

  const numbers = screen.getAllByPlaceholderText('0');
  await fireEvent.changeText(numbers[0], '10');
  await fireEvent.changeText(numbers[1], '900');

  await fireEvent.press(screen.getByText('Write it'));
  await waitFor(() =>
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        vendorId: 'v1',
        items: [expect.objectContaining({ materialId: 'm1', quantity: 10, rate: 900 })],
      }),
    ),
  );
  expect(navigation.replace).toHaveBeenCalledWith('PurchaseDetail', { id: 'p9' });
});

it('adds another line when asked', async () => {
  await mount();
  expect(screen.getByText('Line 1')).toBeTruthy();
  await fireEvent.press(screen.getByText('Another line'));
  expect(await screen.findByText('Line 2')).toBeTruthy();
});
