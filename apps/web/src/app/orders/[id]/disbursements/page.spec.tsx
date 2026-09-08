import { Suspense } from 'react';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PERMISSIONS } from '@decor/shared';
import OrderDisbursementsPage from './page';

const apiMock = {
  orderDisbursements: jest.fn(),
  disbursementCategories: jest.fn(),
  createDisbursement: jest.fn(),
  settleDisbursement: jest.fn(),
  cancelDisbursement: jest.fn(),
};
jest.mock('@/lib/api', () => ({
  api: new Proxy(
    {},
    {
      get: (_t, key: string) => (...args: unknown[]) =>
        apiMock[key as keyof typeof apiMock](...args),
    },
  ),
}));

let granted: string[] = [];
jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, can: (p: string) => granted.includes(p) }),
}));

jest.mock('@/components/Shell', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const row = (over: Record<string, unknown> = {}) => ({
  id: 'd1',
  payeeName: 'Ramesh (fitter)',
  amount: '4000',
  status: 'PLANNED',
  paidMode: null,
  paidAt: null,
  reference: null,
  note: null,
  category: { id: 'cat1', name: 'Fitting' },
  ...over,
});

const LEDGER = {
  label: 'Payouts',
  total: 12000,
  paid: 8000,
  pending: 4000,
  count: 2,
  disbursements: [row(), row({ id: 'd2', status: 'PAID', paidMode: 'CASH', amount: '8000', paidAt: '2026-09-01T00:00:00.000Z' })],
};

const open = async (ledger: unknown = LEDGER) => {
  apiMock.orderDisbursements.mockResolvedValue(ledger);
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <OrderDisbursementsPage params={Promise.resolve({ id: 'o1' })} />
      </Suspense>,
    );
  });
};

async function mount(ledger: unknown = LEDGER) {
  await open(ledger);
  await screen.findByText('Committed');
}

const field = (label: string) =>
  Array.from(document.querySelectorAll('label.field'))
    .find((node) => node.querySelector('.field-label')?.textContent?.startsWith(label))!
    .querySelector('input, textarea') as HTMLInputElement;

beforeEach(() => {
  jest.clearAllMocks();
  granted = [PERMISSIONS.DISBURSEMENT_MANAGE];
  apiMock.disbursementCategories.mockResolvedValue([
    { id: 'cat1', name: 'Fitting' },
    { id: 'cat2', name: 'Transport' },
  ]);
  apiMock.createDisbursement.mockResolvedValue({});
  apiMock.settleDisbursement.mockResolvedValue({});
  apiMock.cancelDisbursement.mockResolvedValue({});
});

it('says it is loading rather than showing an empty ledger', async () => {
  apiMock.orderDisbursements.mockReturnValue(new Promise(() => {}));
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <OrderDisbursementsPage params={Promise.resolve({ id: 'o1' })} />
      </Suspense>,
    );
  });
  expect(await screen.findByText('Loading')).toBeInTheDocument();
});

it('says plainly that this sits beside the order and does not change it', async () => {
  await mount();
  // The order is worth what it was quoted at and is settled when that much has
  // been collected; a payout is a separate obligation.
  expect(
    screen.getByText(/The order's own total and payment status are\s+unchanged/),
  ).toBeInTheDocument();
  expect(screen.getByText('Paid out of this order, after the client has paid')).toBeInTheDocument();
});

it('never nets a payout off what the client owes', async () => {
  await mount();
  // Committed, paid out and still owed are the shop's obligations — none of
  // them is subtracted from the order's own total anywhere on this screen.
  expect(screen.getByText('Committed')).toBeInTheDocument();
  expect(screen.getByText('₹12,000')).toBeInTheDocument();
  // Twice each: the summary card, and the payout it came from.
  expect(screen.getAllByText('₹8,000')).toHaveLength(2);
  expect(screen.getAllByText('₹4,000')).toHaveLength(2);
});

it('uses whatever the shop calls these, not a fixed word', async () => {
  await mount({ ...LEDGER, label: 'ISC' });
  expect(screen.getAllByText('ISC').length).toBeGreaterThan(0);
  expect(screen.getByText('Add ISC')).toBeInTheDocument();
});

it('counts the payouts in the plural', async () => {
  await mount();
  expect(screen.getByText('2 payouts')).toBeInTheDocument();
});

it('counts a single payout in the singular', async () => {
  await mount({ ...LEDGER, count: 1, disbursements: [row()] });
  expect(screen.getByText('1 payout')).toBeInTheDocument();
});

it('says so when there is nothing to pay out', async () => {
  await mount({ ...LEDGER, count: 0, disbursements: [] });
  expect(screen.getByText('Nothing to pay out yet')).toBeInTheDocument();
  // The heading falls back to the plain word when there is no count to give.
  expect(screen.getAllByText('Payouts').length).toBeGreaterThan(0);
});

describe('each payout', () => {
  it('names who it is for and what it is for', async () => {
    await mount();
    expect(screen.getAllByText('Ramesh (fitter)').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Fitting/).length).toBeGreaterThan(0);
  });

  it('says uncategorised rather than nothing when it has no category', async () => {
    await mount({ ...LEDGER, disbursements: [row({ category: null })] });
    expect(screen.getByText('Uncategorised')).toBeInTheDocument();
  });

  it('shows a note and a reference when there are any', async () => {
    await mount({
      ...LEDGER,
      disbursements: [row({ note: 'Two days on site', reference: 'UTR77' })],
    });
    expect(screen.getByText('Two days on site')).toBeInTheDocument();
    expect(screen.getByText(/ref UTR77/)).toBeInTheDocument();
  });

  it('marks what is still owed and what has gone out, and how', async () => {
    await mount();
    expect(screen.getByText('Owed')).toBeInTheDocument();
    expect(screen.getByText('Paid CASH')).toBeInTheDocument();
  });

  it('offers to settle only what is still owed', async () => {
    await mount();
    expect(screen.getAllByText('Mark paid')).toHaveLength(1);
  });

  it('offers nothing to somebody who may only look', async () => {
    granted = [];
    await mount();
    expect(screen.queryByText('Mark paid')).not.toBeInTheDocument();
    expect(screen.queryByText('Cancel')).not.toBeInTheDocument();
    expect(screen.queryByText('Add Payouts')).not.toBeInTheDocument();
  });

  it('cancels one, and re-reads the ledger', async () => {
    await mount();
    fireEvent.click(screen.getAllByText('Cancel')[0]);
    await waitFor(() => expect(apiMock.cancelDisbursement).toHaveBeenCalledWith('d1'));
    await waitFor(() => expect(apiMock.orderDisbursements).toHaveBeenCalledTimes(2));
  });
});

describe('adding a payout', () => {
  const openSheet = async () => {
    await mount();
    fireEvent.click(screen.getByText('Add Payouts'));
    await screen.findByText('Money leaving this order');
  };

  it('will not add one with no payee or no amount', async () => {
    await openSheet();
    fireEvent.click(screen.getByText('Add'));
    expect(apiMock.createDisbursement).not.toHaveBeenCalled();
  });

  it('records it as still owed by default', async () => {
    await openSheet();
    fireEvent.change(field('Paid to'), { target: { value: ' Ramesh ' } });
    fireEvent.change(field('Amount'), { target: { value: '4000' } });
    fireEvent.click(screen.getByText('Add'));
    await waitFor(() => expect(apiMock.createDisbursement).toHaveBeenCalled());
    expect(apiMock.createDisbursement.mock.calls[0]).toEqual([
      'o1',
      {
        payeeName: 'Ramesh',
        amount: 4000,
        categoryId: undefined,
        note: undefined,
        status: 'PLANNED',
        paidMode: undefined,
      },
    ]);
  });

  it('records one that has already gone out, and how it went', async () => {
    await openSheet();
    fireEvent.change(field('Paid to'), { target: { value: 'Ramesh' } });
    fireEvent.change(field('Amount'), { target: { value: '4000' } });
    // The chip in the sheet, not the summary card's own wording.
    fireEvent.click(screen.getAllByText('Still owed').at(-1)!);
    fireEvent.click(screen.getAllByText('Online').at(-1)!);
    fireEvent.click(screen.getByText('Add'));
    await waitFor(() => expect(apiMock.createDisbursement).toHaveBeenCalled());
    expect(apiMock.createDisbursement.mock.calls[0][1]).toMatchObject({
      status: 'PAID',
      paidMode: 'ONLINE',
    });
  });

  it('files it under a category, and lets that be unpicked again', async () => {
    await openSheet();
    fireEvent.change(field('Paid to'), { target: { value: 'Ramesh' } });
    fireEvent.change(field('Amount'), { target: { value: '4000' } });
    fireEvent.click(screen.getAllByText('Transport').at(-1)!);
    fireEvent.click(screen.getAllByText('Transport').at(-1)!);
    fireEvent.click(screen.getAllByText('Fitting').at(-1)!);
    fireEvent.click(screen.getByText('Add'));
    await waitFor(() => expect(apiMock.createDisbursement).toHaveBeenCalled());
    expect(apiMock.createDisbursement.mock.calls[0][1].categoryId).toBe('cat1');
  });

  it('re-reads the ledger afterwards', async () => {
    await openSheet();
    fireEvent.change(field('Paid to'), { target: { value: 'Ramesh' } });
    fireEvent.change(field('Amount'), { target: { value: '4000' } });
    fireEvent.click(screen.getByText('Add'));
    await waitFor(() => expect(apiMock.orderDisbursements).toHaveBeenCalledTimes(2));
  });

  it('says why one was refused, and keeps what was typed', async () => {
    apiMock.createDisbursement.mockRejectedValue(new Error('Client has not paid yet'));
    await openSheet();
    fireEvent.change(field('Paid to'), { target: { value: 'Ramesh' } });
    fireEvent.change(field('Amount'), { target: { value: '4000' } });
    fireEvent.click(screen.getByText('Add'));
    expect(await screen.findByText('Client has not paid yet')).toBeInTheDocument();
    expect(field('Paid to')).toHaveValue('Ramesh');
  });
});

describe('settling a payout', () => {
  const openSettle = async () => {
    await mount();
    fireEvent.click(screen.getByText('Mark paid'));
    await screen.findByText('Mark as paid');
  };

  it('names who is being paid and how much', async () => {
    await openSettle();
    expect(screen.getByText('Ramesh (fitter) · ₹4,000')).toBeInTheDocument();
  });

  it('records how it went out', async () => {
    await openSettle();
    fireEvent.click(screen.getAllByText('Online').at(-1)!);
    fireEvent.click(screen.getAllByText('Mark paid').at(-1)!);
    await waitFor(() => expect(apiMock.settleDisbursement).toHaveBeenCalled());
    expect(apiMock.settleDisbursement.mock.calls[0]).toEqual([
      'd1',
      { paidMode: 'ONLINE', reference: undefined },
    ]);
  });

  it('keeps the reference when one was given', async () => {
    await openSettle();
    fireEvent.change(field('Reference'), { target: { value: ' UTR77 ' } });
    fireEvent.click(screen.getAllByText('Mark paid').at(-1)!);
    await waitFor(() => expect(apiMock.settleDisbursement).toHaveBeenCalled());
    expect(apiMock.settleDisbursement.mock.calls[0][1].reference).toBe('UTR77');
  });

  it('re-reads the ledger afterwards', async () => {
    await openSettle();
    fireEvent.click(screen.getAllByText('Mark paid').at(-1)!);
    await waitFor(() => expect(apiMock.orderDisbursements).toHaveBeenCalledTimes(2));
  });
});
