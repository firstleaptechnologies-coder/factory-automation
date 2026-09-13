import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ReportRequestPage from './page';

const apiMock = { requestReport: jest.fn(), searchClients: jest.fn() };
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
  apiMock.searchClients.mockResolvedValue([]);
});

async function draw() {
  let view!: ReturnType<typeof render>;
  await act(async () => {
    view = render(<ReportRequestPage />);
  });
  return view;
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

describe('a report about one client', () => {
  const CLIENTS = [
    { id: 'c1', name: 'Sharma Interiors', code: 'CL-1', phone: '9876543210' },
    { id: 'c2', name: 'Bhatia Residence', code: 'CL-2', phone: '9876500000' },
  ];

  /** The report Select is the first of the two on the page. */
  async function chooseStatement() {
    const view = await draw();
    const trigger = view.container.querySelectorAll('.select-trigger')[0] as HTMLElement;
    await act(async () => {
      fireEvent.click(trigger);
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Client statement'));
    });
  }

  beforeEach(() => {
    apiMock.searchClients.mockResolvedValue(CLIENTS);
  });

  it('refuses until a client is chosen, in the API’s own words', async () => {
    await chooseStatement();

    expect(screen.getByText(/is about one client, so it needs one/)).toBeInTheDocument();
    expect(screen.getByText('Ask for it').closest('button')).toBeDisabled();
  });

  // Nothing goes looking up the client list until somebody types in the sheet.
  it('does not fetch clients for a report that has no subject', async () => {
    await draw();

    expect(apiMock.searchClients).not.toHaveBeenCalled();
  });

  /*
   * Search, and only search.
   *
   * The picker is the one the punch and quote pages use, with its add-a-new
   * half turned off: a statement for a client the shop has never traded with
   * would be an empty report about a client created to read it.
   */
  it('offers no way to create a client from here', async () => {
    await chooseStatement();

    expect(screen.getByLabelText('Search existing clients')).toBeInTheDocument();
    expect(screen.queryByText('or add a new one')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Who is it for?')).not.toBeInTheDocument();
  });

  it('sends the chosen client with the request', async () => {
    await chooseStatement();

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Search existing clients'));
    });
    fireEvent.change(screen.getByPlaceholderText('Type to search…'), {
      target: { value: 'sharma' },
    });
    await waitFor(() => expect(screen.getByText('Sharma Interiors')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByText('Sharma Interiors'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Ask for it'));
    });

    expect(apiMock.requestReport).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'CLIENT_STATEMENT', clientId: 'c1' }),
    );
  });
});
