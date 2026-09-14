import { fireEvent, render, screen } from '@testing-library/react';
import OutstandingPage from './page';

jest.mock('@/components/Shell', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const apiMock = { outstanding: jest.fn() };
jest.mock('@/lib/api', () => ({
  api: new Proxy(
    {},
    {
      get: (_t, key: string) => (...args: unknown[]) =>
        apiMock[key as keyof typeof apiMock](...(args as [never])),
    },
  ),
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

async function mount(data: unknown = OWED) {
  apiMock.outstanding.mockResolvedValue(data);
  render(<OutstandingPage />);
  await screen.findByText('Owed to you');
}

beforeEach(() => jest.clearAllMocks());

/*
 * The figure the owner who trialled this had to work out on paper, and said he
 * would not trust the rest of the numbers until a screen showed it.
 */
it('leads with what the shop is still to collect', async () => {
  await mount();

  expect(await screen.findByText('₹84,400')).toBeInTheDocument();
  expect(screen.getByText('across 3 orders')).toBeInTheDocument();
});

it('counts one order in the singular', async () => {
  await mount({ ...OWED, orders: 1 });
  expect(await screen.findByText('across 1 order')).toBeInTheDocument();
});

it('says who owes it, biggest first, as the server ordered them', async () => {
  await mount();

  expect(await screen.findByText('Priya Mehta')).toBeInTheDocument();
  expect(screen.getByText('₹68,200')).toBeInTheDocument();
  expect(screen.getByText('2 orders')).toBeInTheDocument();
  expect(screen.getByText('1 order')).toBeInTheDocument();
});

it('opens the client, which is who you are about to ring', async () => {
  await mount();

  fireEvent.click(await screen.findByText('Priya Mehta'));

  expect(push).toHaveBeenCalledWith('/clients/c1');
});

/*
 * Money held is not a debt, and must never be quietly taken off one.
 */
it('shows money held over as its own line, not against what is owed', async () => {
  await mount({ ...OWED, owed: 1000, held: 500 });

  expect(await screen.findByText('₹1,000')).toBeInTheDocument();
  expect(screen.getByTestId('held')).toHaveTextContent(
    'Separately, ₹500 taken against orders that came to less.',
  );
});

it('keeps that line off a shop holding nothing extra', async () => {
  await mount();
  await screen.findByText('₹84,400');
  expect(screen.queryByTestId('held')).toBeNull();
});

it('says so plainly when every order has been paid for', async () => {
  await mount({ owed: 0, orders: 0, held: 0, clients: [] });

  expect(await screen.findByText('Nothing outstanding')).toBeInTheDocument();
  expect(screen.getByText('₹0')).toBeInTheDocument();
});
