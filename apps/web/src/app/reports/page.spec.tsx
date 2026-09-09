import { act, render, screen, waitFor } from '@testing-library/react';
import ReportsPage from './page';

const apiMock = {
  reports: jest.fn(),
  reportDownloadUrl: jest.fn((id: string) => `/api/reports/${id}/download`),
};
jest.mock('@/lib/api', () => ({
  api: new Proxy(
    {},
    {
      get: (_t, key: string) => (...args: unknown[]) =>
        apiMock[key as keyof typeof apiMock](...args as [string]),
    },
  ),
}));

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

jest.mock('@/components/Shell', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

let allowed = ['report.view', 'report.run'];
jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ can: (permission: string) => allowed.includes(permission) }),
}));

const row = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  kind: 'PAYOUT_LEDGER',
  format: 'XLSX',
  status: 'READY',
  fromDate: '2026-04-01',
  toDate: '2027-03-31',
  rowCount: 7,
  error: null,
  createdAt: '2026-09-09',
  requestedBy: { id: 'u1', name: 'Administrator' },
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
  allowed = ['report.view', 'report.run'];
  apiMock.reports.mockResolvedValue([row()]);
});

async function draw() {
  await act(async () => {
    render(<ReportsPage />);
  });
}

it('lists a report by its label rather than its code', async () => {
  await draw();

  expect(screen.getByText('Payout ledger')).toBeInTheDocument();
  expect(screen.getByText(/7 rows/)).toBeInTheDocument();
});

it('offers the file only once it is ready', async () => {
  await draw();

  expect(screen.getByText('Download')).toHaveAttribute(
    'href',
    '/api/reports/r1/download',
  );
});

it('offers nothing to download while it is still building', async () => {
  apiMock.reports.mockResolvedValue([row({ status: 'GENERATING' })]);

  await draw();

  expect(screen.queryByText('Download')).not.toBeInTheDocument();
  expect(screen.getByText('Building')).toBeInTheDocument();
});

// Leaving somebody staring at a row that stopped moving, with no reason, is
// the whole failure this avoids.
it('says why a report failed', async () => {
  apiMock.reports.mockResolvedValue([
    row({ status: 'FAILED', error: 'Database `bigshop` does not exist' }),
  ]);

  await draw();

  expect(screen.getByText(/does not exist/)).toBeInTheDocument();
});

it('tells somebody an expired report is gone rather than broken', async () => {
  apiMock.reports.mockResolvedValue([row({ status: 'EXPIRED' })]);

  await draw();

  expect(screen.getByText('Expired')).toBeInTheDocument();
  expect(screen.queryByText('Download')).not.toBeInTheDocument();
});

it('hides asking for one from somebody who may only read them', async () => {
  allowed = ['report.view'];

  await draw();

  expect(screen.queryByText('Ask for a report')).not.toBeInTheDocument();
});

describe('while something is still working', () => {
  // A row moves on its own, so the screen has to look again — but only while
  // there is something to look for.
  it('reloads until the work finishes, then stops', async () => {
    jest.useFakeTimers();
    apiMock.reports.mockResolvedValue([row({ status: 'QUEUED' })]);

    await act(async () => {
      render(<ReportsPage />);
    });
    expect(apiMock.reports).toHaveBeenCalledTimes(1);

    apiMock.reports.mockResolvedValue([row({ status: 'READY' })]);
    await act(async () => {
      jest.advanceTimersByTime(4000);
    });
    expect(apiMock.reports).toHaveBeenCalledTimes(2);

    // Now everything is READY: no further polling.
    await act(async () => {
      jest.advanceTimersByTime(20_000);
    });
    expect(apiMock.reports).toHaveBeenCalledTimes(2);
  });

  it('does not poll at all when nothing is working', async () => {
    jest.useFakeTimers();

    await act(async () => {
      render(<ReportsPage />);
    });
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });

    expect(apiMock.reports).toHaveBeenCalledTimes(1);
  });
});

it('says the shop has asked for nothing yet', async () => {
  apiMock.reports.mockResolvedValue([]);

  await draw();

  await waitFor(() => expect(screen.getByText('Nothing asked for yet')).toBeInTheDocument());
});
