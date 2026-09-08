import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PERMISSIONS } from '@decor/shared';
import VendorsPage from './page';

const apiMock = { vendors: jest.fn() };
jest.mock('@/lib/api', () => ({
  api: new Proxy(
    {},
    {
      get: (_t, key: string) => (...args: never[]) =>
        (apiMock[key as keyof typeof apiMock] as (...a: never[]) => unknown)(...args),
    },
  ),
}));

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

let permissions: string[] = [];
jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ can: (p: string) => permissions.includes(p) }),
}));

jest.mock('@/components/Shell', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const VENDOR = {
  id: 'v1',
  code: 'VEN-0001',
  name: 'Verma Boards',
  supplies: 'Plywood and MDF',
  gstin: '08AAACH7409R1ZS',
  isActive: true,
  _count: { purchases: 3 },
  createdAt: '2026-09-01T00:00:00Z',
};

const page = (rows: unknown[]) => ({
  data: rows,
  meta: { page: 1, limit: 25, total: rows.length, pages: 1 },
});

beforeEach(() => {
  jest.clearAllMocks();
  permissions = [PERMISSIONS.VENDOR_VIEW, PERMISSIONS.VENDOR_MANAGE];
  apiMock.vendors.mockResolvedValue(page([VENDOR]));
});

const mount = async () => {
  render(<VendorsPage />);
  await screen.findByText('Vendors');
};

it('says who they are and what they supply', async () => {
  await mount();
  expect(await screen.findByText('Verma Boards')).toBeInTheDocument();
  expect(screen.getByText('Plywood and MDF')).toBeInTheDocument();
  expect(screen.getByText('08AAACH7409R1ZS')).toBeInTheDocument();
});

it('leaves the retired ones out until they are asked for', async () => {
  await mount();
  expect(apiMock.vendors.mock.calls[0][0].includeInactive).toBeUndefined();
  fireEvent.click(screen.getByText('Include retired'));
  await waitFor(() =>
    expect(apiMock.vendors).toHaveBeenLastCalledWith(
      expect.objectContaining({ includeInactive: true }),
    ),
  );
});

it('opens one, and the form for a new one', async () => {
  await mount();
  fireEvent.click(await screen.findByText('Verma Boards'));
  expect(push).toHaveBeenCalledWith('/vendors/v1');
  fireEvent.click(screen.getByText('Add a vendor'));
  expect(push).toHaveBeenCalledWith('/vendors/new');
});

it('offers adding one only to whoever may', async () => {
  permissions = [PERMISSIONS.VENDOR_VIEW];
  await mount();
  expect(screen.queryByText('Add a vendor')).toBeNull();
});
