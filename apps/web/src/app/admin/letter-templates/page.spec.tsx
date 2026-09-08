import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LetterTemplatesPage from './page';

const apiMock = {
  letterTemplates: jest.fn(),
  createLetterTemplate: jest.fn(),
  updateLetterTemplate: jest.fn(),
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

jest.mock('@/components/Shell', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const TEMPLATE = {
  id: 't1',
  kind: 'OFFER',
  name: 'Offer',
  body: 'Dear {{name}}, we are pleased to offer you the post of {{designation}}.',
  isActive: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  apiMock.letterTemplates.mockResolvedValue([TEMPLATE]);
  apiMock.createLetterTemplate.mockResolvedValue(TEMPLATE);
  apiMock.updateLetterTemplate.mockResolvedValue(TEMPLATE);
});

const mount = async () => {
  render(<LetterTemplatesPage />);
  await screen.findByText('Letter templates');
};

/** Opens the seeded template, once the table it is in has arrived. */
const openOffer = async () =>
  fireEvent.click(await screen.findByText('Offer', { selector: 'td' }));

it('lists the templates by what they are for', async () => {
  await mount();
  expect(await screen.findByText('Offer', { selector: 'td' })).toBeInTheDocument();
  expect(screen.getByText('Offer letter')).toBeInTheDocument();
});

it('drops a placeholder in where the words go', async () => {
  await mount();
  await openOffer();
  const body = await screen.findByLabelText(/What it says/);
  fireEvent.change(body, { target: { value: 'Dear ' } });
  fireEvent.click(screen.getByText('Their name'));
  expect(body).toHaveValue('Dear {{name}}');
});

it('warns about a placeholder nothing will ever fill in', async () => {
  await mount();
  await openOffer();
  fireEvent.change(await screen.findByLabelText(/What it says/), {
    target: { value: 'Dear {{name}}, your bonus is {{bonus}} and this is long enough.' },
  });
  // Braces printed on a page somebody hands to a bank is the sort of mistake
  // nobody notices until it has happened.
  expect(await screen.findByText(/Nothing will fill in \{\{bonus\}\}/)).toBeInTheDocument();
});

it('says nothing when every placeholder is one we can fill', async () => {
  await mount();
  await openOffer();
  await screen.findByLabelText(/What it says/);
  expect(screen.queryByText(/Nothing will fill in/)).toBeNull();
});

it('saves an edit to the template it opened', async () => {
  await mount();
  await openOffer();
  fireEvent.change(await screen.findByLabelText(/What it says/), {
    target: { value: 'Dear {{name}}, the post of {{designation}} is yours from {{joinedOn}}.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(apiMock.updateLetterTemplate).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ kind: 'OFFER' }),
    ),
  );
  expect(apiMock.createLetterTemplate).not.toHaveBeenCalled();
});

it('will not save a template with nothing in it', async () => {
  await mount();
  fireEvent.click(screen.getByText('New template'));
  expect(await screen.findByRole('button', { name: 'Save' })).toBeDisabled();
});
