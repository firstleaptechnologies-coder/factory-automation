import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Suspense } from 'react';
import { PERMISSIONS } from '@fas/shared';
import VendorPage from './page';

const apiMock = {
  vendor: jest.fn(),
  createVendor: jest.fn(),
  updateVendor: jest.fn(),
  retireVendor: jest.fn(),
};
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
  phone: '9876543210',
  gstin: '08AAACH7409R1ZS',
  supplies: 'Plywood and MDF',
  isActive: true,
  createdAt: '2026-09-01T00:00:00Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  permissions = [PERMISSIONS.VENDOR_VIEW, PERMISSIONS.VENDOR_MANAGE];
  apiMock.vendor.mockResolvedValue(VENDOR);
  apiMock.updateVendor.mockResolvedValue(VENDOR);
  apiMock.retireVendor.mockResolvedValue({ ...VENDOR, isActive: false });
});

const mount = async (vendor: unknown = VENDOR) => {
  apiMock.vendor.mockResolvedValue(vendor);
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <VendorPage params={Promise.resolve({ id: 'v1' })} />
      </Suspense>,
    );
  });
};

it('opens one with what is on file', async () => {
  await mount();
  expect(await screen.findByDisplayValue('Verma Boards')).toBeInTheDocument();
  expect(screen.getByDisplayValue('08AAACH7409R1ZS')).toBeInTheDocument();
});

it('saves an edit rather than adding a second row', async () => {
  await mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Save' }));
  await waitFor(() => expect(apiMock.updateVendor).toHaveBeenCalledWith('v1', expect.anything()));
  expect(apiMock.createVendor).not.toHaveBeenCalled();
});

it('says why a save was refused, rather than nothing', async () => {
  apiMock.updateVendor.mockRejectedValue(new Error('A GSTIN is 15 characters.'));
  await mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Save' }));
  expect(await screen.findByText('A GSTIN is 15 characters.')).toBeInTheDocument();
});

it('retires rather than deletes', async () => {
  await mount();
  fireEvent.click(await screen.findByText('Retire'));
  await waitFor(() => expect(apiMock.retireVendor).toHaveBeenCalledWith('v1'));
});

it('does not offer to retire one already retired', async () => {
  await mount({ ...VENDOR, isActive: false });
  expect(await screen.findByText('VEN-0001 · retired')).toBeInTheDocument();
  expect(screen.queryByText('Retire')).toBeNull();
});

it('says plainly when somebody may look but not change', async () => {
  permissions = [PERMISSIONS.VENDOR_VIEW];
  await mount();
  expect(
    await screen.findByText('You may look at vendors but not change them.'),
  ).toBeInTheDocument();
});
