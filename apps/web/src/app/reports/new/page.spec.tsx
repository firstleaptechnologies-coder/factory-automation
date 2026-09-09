import { act, fireEvent, render, screen } from '@testing-library/react';
import ReportRequestPage from './page';

const apiMock = { requestReport: jest.fn() };
jest.mock('@/lib/api', () => ({
  api: new Proxy(
    {},
    {
      get: (_t, key: string) => (...args: unknown[]) =>
        apiMock[key as keyof typeof apiMock](...args as [never]),
    },
  ),
}));

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

jest.mock('@/components/Shell', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

beforeEach(() => {
  jest.clearAllMocks();
  apiMock.requestReport.mockResolvedValue({ id: 'r1' });
});

async function draw() {
  await act(async () => {
    render(<ReportRequestPage />);
  });
}

it('describes the report that is selected', async () => {
  await draw();

  // The first in the catalogue is the GST summary.
  expect(screen.getByText(/Taxable value and tax by slab/)).toBeInTheDocument();
});

it('asks for the report and goes back to the list', async () => {
  await draw();

  await act(async () => {
    fireEvent.click(screen.getByText('Ask for it'));
  });

  expect(apiMock.requestReport).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'GST_SUMMARY' }),
  );
  expect(push).toHaveBeenCalledWith('/reports');
});

// The screen refuses with the same function the API refuses with, so the two
// cannot come to disagree about what a valid request is.
it('refuses a period that ends before it starts, in the API’s own words', async () => {
  await draw();

  const inputs = screen.getAllByDisplayValue(/^\d{4}-\d{2}-\d{2}$/);
  await act(async () => {
    fireEvent.change(inputs[1], { target: { value: '2020-01-01' } });
  });

  expect(screen.getByText('The period ends before it starts.')).toBeInTheDocument();
  expect(screen.getByText('Ask for it').closest('button')).toBeDisabled();
});

it('shows what the API said when it refuses anyway', async () => {
  apiMock.requestReport.mockRejectedValue(new Error('Salary register is still to be written.'));

  await draw();
  await act(async () => {
    fireEvent.click(screen.getByText('Ask for it'));
  });

  expect(screen.getByText('Salary register is still to be written.')).toBeInTheDocument();
  expect(push).not.toHaveBeenCalled();
});
