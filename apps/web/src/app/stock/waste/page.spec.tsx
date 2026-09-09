import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { monthBounds, shiftMonth, thisMonth } from '@fas/shared';
import WastePage from './page';

const apiMock = { wasteReport: jest.fn() };
jest.mock('@/lib/api', () => ({
  api: new Proxy(
    {},
    {
      get: (_t, key: string) => (...args: never[]) =>
        (apiMock[key as keyof typeof apiMock] as (...a: never[]) => unknown)(...args),
    },
  ),
}));

jest.mock('@/components/Shell', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const ROW = {
  material: { id: 'm1', code: 'PLY', name: 'Plywood', stockUnit: 'sheet' },
  consumed: 10,
  offcut: 2,
  wasted: 1.5,
  wastePct: 15,
};

beforeEach(() => {
  jest.clearAllMocks();
  apiMock.wasteReport.mockResolvedValue({
    from: '2026-09-01',
    to: '2026-09-30',
    rows: [ROW],
    totals: { consumed: 10, offcut: 2, wasted: 1.5, wastePct: 15 },
  });
});

const mount = async () => {
  render(<WastePage />);
  await screen.findByText('Waste');
};

it('asks for this month, in local days', async () => {
  await mount();
  expect(apiMock.wasteReport).toHaveBeenCalledWith(monthBounds(thisMonth()));
});

it('leads with the share of what was issued, not of what was bought', async () => {
  await mount();
  // A shop that buys a hundred sheets and cuts ten has wasted a share of ten.
  expect(await screen.findByText('15% of what was issued')).toBeInTheDocument();
  expect(screen.getByText('10 issued, 2 back as offcut')).toBeInTheDocument();
});

it('steps to another month without typing', async () => {
  await mount();
  fireEvent.click(screen.getByText('Previous'));
  await waitFor(() =>
    expect(apiMock.wasteReport).toHaveBeenLastCalledWith(
      monthBounds(shiftMonth(thisMonth(), -1)),
    ),
  );
});

it('says so plainly when nothing was cut', async () => {
  apiMock.wasteReport.mockResolvedValue({
    from: '2026-09-01',
    to: '2026-09-30',
    rows: [],
    totals: { consumed: 0, offcut: 0, wasted: 0, wastePct: 0 },
  });
  await mount();
  expect(await screen.findByText('Nothing was cut this month')).toBeInTheDocument();
});
