import { Suspense } from 'react';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import ClientFirmPage from './page';

const apiMock = { client: jest.fn(), updateClient: jest.fn() };
jest.mock('@/lib/api', () => ({
  api: new Proxy(
    {},
    {
      get: (_t, key: string) => (...args: unknown[]) =>
        apiMock[key as keyof typeof apiMock](...args),
    },
  ),
}));

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

jest.mock('@/components/Shell', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const CLIENT = {
  id: 'c1',
  code: 'CLI-1',
  name: 'Verma Interiors',
  company: 'Verma & Sons',
  phone: '9820012345',
  altPhone: null,
  email: null,
  gstin: '27AAAPV1234C1ZV',
  stateCode: '27',
  stateName: 'Maharashtra',
  address: null,
  billingAddress: 'Unit 4, Andheri East',
  shippingAddress: null,
  notes: null,
};

const field = (label: string) =>
  Array.from(document.querySelectorAll('label.field'))
    .find((node) => node.querySelector('.field-label')?.textContent?.startsWith(label))!
    .querySelector('input, textarea') as HTMLInputElement;

async function mount(client: unknown = CLIENT) {
  apiMock.client.mockResolvedValue(client);
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <ClientFirmPage params={Promise.resolve({ id: 'c1' })} />
      </Suspense>,
    );
  });
  await screen.findByText('Firm details');
  await waitFor(() => expect(document.querySelector('label.field input')).toBeTruthy());
}

beforeEach(() => {
  jest.clearAllMocks();
  apiMock.updateClient.mockResolvedValue({});
});

it('names whose details these are', async () => {
  await mount();
  expect(screen.getByText('Verma Interiors')).toBeInTheDocument();
});

it('fills the form from what is already on file', async () => {
  await mount();
  expect(field('Contact name')).toHaveValue('Verma Interiors');
  expect(field('GST number')).toHaveValue('27AAAPV1234C1ZV');
  expect(field('Billing address')).toHaveValue('Unit 4, Andheri East');
});

it('leaves the fields nobody has filled in empty rather than showing null', async () => {
  await mount();
  // An order is punched off a phone call; the rest turns up later.
  expect(field('Email')).toHaveValue('');
  expect(field('Alternate number')).toHaveValue('');
});

it('says what each address is for', async () => {
  await mount();
  expect(screen.getByText('Printed on estimates and bills')).toBeInTheDocument();
  expect(screen.getByText('Leave empty if the same as billing')).toBeInTheDocument();
});

describe('saving', () => {
  it('sends what was edited', async () => {
    await mount();
    fireEvent.change(field('Email'), { target: { value: 'accounts@verma.in' } });
    fireEvent.click(screen.getAllByText('Save')[0]);
    await waitFor(() => expect(apiMock.updateClient).toHaveBeenCalled());
    const [id, body] = apiMock.updateClient.mock.calls[0];
    expect(id).toBe('c1');
    expect(body.email).toBe('accounts@verma.in');
    expect(body.name).toBe('Verma Interiors');
  });

  it('leaves out what is still empty rather than sending nulls', async () => {
    await mount();
    fireEvent.click(screen.getAllByText('Save')[0]);
    await waitFor(() => expect(apiMock.updateClient).toHaveBeenCalled());
    const body = apiMock.updateClient.mock.calls[0][1];
    expect(body.altPhone).toBeUndefined();
    expect(body.shippingAddress).toBeUndefined();
  });

  it('goes back to the client once it is saved', async () => {
    await mount();
    fireEvent.click(screen.getAllByText('Save')[0]);
    await waitFor(() => expect(push).toHaveBeenCalledWith('/clients/c1'));
  });

  it('stays put and says why when the server refuses', async () => {
    apiMock.updateClient.mockRejectedValue(new Error('GSTIN is not valid'));
    await mount();
    fireEvent.click(screen.getAllByText('Save')[0]);
    expect(await screen.findByText('GSTIN is not valid')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
