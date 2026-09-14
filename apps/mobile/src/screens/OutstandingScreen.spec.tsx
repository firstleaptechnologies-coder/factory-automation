import { fireEvent, render, screen } from '@testing-library/react-native';
import { OutstandingScreen } from './OutstandingScreen';

const mockOutstanding = jest.fn();
jest.mock('../api/client', () => ({
  api: { outstanding: (...a: unknown[]) => mockOutstanding(...a) },
}));

const OWED = {
  owed: 84400,
  orders: 3,
  held: 0,
  clients: [
    { clientId: 'c1', code: 'CL-1', name: 'Priya Mehta', owed: 68200, orders: 2 },
    { clientId: 'c2', code: 'CL-2', name: 'Sunil Kadam', owed: 16200, orders: 1 },
  ],
};

const navigation = { goBack: jest.fn(), navigate: jest.fn() };
const mount = async (data: unknown = OWED) => {
  mockOutstanding.mockResolvedValue(data);
  await render(<OutstandingScreen navigation={navigation} />);
  await screen.findByText('Owed to you');
};

beforeEach(() => jest.clearAllMocks());

/*
 * The figure the owner who trialled this had to work out on paper, and said he
 * would not trust the rest of the numbers until a screen showed it.
 */
it('leads with what the shop is still to collect', async () => {
  await mount();

  expect(screen.getByText('₹84,400')).toBeTruthy();
  expect(screen.getByText('across 3 orders')).toBeTruthy();
});

it('counts one order in the singular', async () => {
  await mount({ ...OWED, orders: 1 });
  expect(screen.getByText('across 1 order')).toBeTruthy();
});

it('says who owes it, biggest first, as the server ordered them', async () => {
  await mount();

  expect(screen.getByText('Priya Mehta')).toBeTruthy();
  expect(screen.getByText('₹68,200')).toBeTruthy();
  expect(screen.getByText('CL-1 · 2 orders')).toBeTruthy();
  expect(screen.getByText('CL-2 · 1 order')).toBeTruthy();
});

it('opens the client, which is who you are about to ring', async () => {
  await mount();

  await fireEvent.press(screen.getByText('Priya Mehta'));

  expect(navigation.navigate).toHaveBeenCalledWith('ClientDetail', { clientId: 'c1' });
});

/*
 * Money held is not a debt, and must never be quietly taken off one. A shop
 * short ₹1,000 on one order and holding ₹500 too much on another is owed a
 * thousand rupees; a single figure of ₹500 would report the debt as smaller
 * than it is.
 */
it('shows money held over as its own line, not against what is owed', async () => {
  await mount({ ...OWED, owed: 1000, held: 500 });

  expect(screen.getByText('₹1,000')).toBeTruthy();
  expect(screen.getByTestId('held')).toHaveTextContent(
    'Separately, ₹500 taken against orders that came to less.',
  );
});

it('keeps that line off a shop holding nothing extra', async () => {
  await mount();
  expect(screen.queryByTestId('held')).toBeNull();
});

it('says so plainly when every order has been paid for', async () => {
  await mount({ owed: 0, orders: 0, held: 0, clients: [] });

  expect(screen.getByText('Nothing outstanding')).toBeTruthy();
  expect(screen.getByText('₹0')).toBeTruthy();
});

it('goes back', async () => {
  await mount();
  await fireEvent.press(screen.getByLabelText('Back'));
  expect(navigation.goBack).toHaveBeenCalled();
});
