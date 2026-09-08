import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Suspense } from 'react';
import { PERMISSIONS } from '@decor/shared';
import EmployeeLettersPage from './page';

const apiMock = {
  employee: jest.fn(),
  letters: jest.fn(),
  letterTemplates: jest.fn(),
  letterDraft: jest.fn(),
  issueLetter: jest.fn(),
  letterDocumentUrl: jest.fn((id: string) => `http://api.test/letters/${id}/document`),
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

let permissions: string[] = [];
jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ can: (p: string) => permissions.includes(p) }),
}));

jest.mock('@/components/Shell', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const LETTER = {
  id: 'l1',
  employeeId: 'e1',
  kind: 'OFFER',
  title: 'Offer — Ramesh Kumar',
  body: 'Dear Ramesh Kumar,\n\nWe are pleased to offer you the post.',
  issuedOn: '2026-09-09',
  createdAt: '2026-09-09T00:00:00Z',
};

const TEMPLATE = {
  id: 't1',
  kind: 'OFFER',
  name: 'Offer',
  body: 'Dear {{name}}, we are pleased to offer you the post of {{designation}}.',
  isActive: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  permissions = [PERMISSIONS.EMPLOYEE_VIEW, PERMISSIONS.EMPLOYEE_MANAGE];
  apiMock.employee.mockResolvedValue({ id: 'e1', name: 'Ramesh Kumar', code: 'EMP-0001' });
  apiMock.letters.mockResolvedValue([LETTER]);
  apiMock.letterTemplates.mockResolvedValue([
    TEMPLATE,
    { ...TEMPLATE, id: 't2', isActive: false },
  ]);
  apiMock.letterDraft.mockResolvedValue({
    kind: 'OFFER',
    title: 'Offer — Ramesh Kumar',
    body: 'Dear Ramesh Kumar, we are pleased to offer you the post of CNC operator.',
  });
  apiMock.issueLetter.mockResolvedValue(LETTER);
});

const mount = async () => {
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <EmployeeLettersPage params={Promise.resolve({ id: 'e1' })} />
      </Suspense>,
    );
  });
};

it('lists what somebody has been given, with a way to open it', async () => {
  await mount();
  expect(await screen.findByText('Offer — Ramesh Kumar')).toBeInTheDocument();
  expect(screen.getByText('Open it')).toHaveAttribute(
    'href',
    'http://api.test/letters/l1/document',
  );
});

it('drafts the wording from the server, filled in for this person', async () => {
  await mount();
  fireEvent.click(screen.getByText('Write a letter'));
  const trigger = document.querySelectorAll('.select-trigger')[0] as HTMLElement;
  fireEvent.click(trigger);
  fireEvent.click(await screen.findByRole('option', { name: /Offer letter · Offer/ }));

  // The preview somebody reads and the letter that is filed come from the same
  // substitution, on the server.
  await waitFor(() => expect(apiMock.letterDraft).toHaveBeenCalledWith('t1', 'e1'));
  expect(await screen.findByDisplayValue(/post of CNC operator/)).toBeInTheDocument();
});

it('files the body as it stands, not the template it came from', async () => {
  await mount();
  fireEvent.click(screen.getByText('Write a letter'));
  fireEvent.click(document.querySelectorAll('.select-trigger')[0] as HTMLElement);
  fireEvent.click(await screen.findByRole('option', { name: /Offer letter · Offer/ }));
  await waitFor(() => expect(apiMock.letterDraft).toHaveBeenCalled());

  fireEvent.change(await screen.findByLabelText(/What it says/), {
    target: { value: 'Dear Ramesh Kumar, the post is yours from Monday.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'File it' }));

  await waitFor(() =>
    expect(apiMock.issueLetter).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeId: 'e1',
        kind: 'OFFER',
        body: 'Dear Ramesh Kumar, the post is yours from Monday.',
      }),
    ),
  );
});

it('offers only the templates the shop still uses', async () => {
  await mount();
  fireEvent.click(screen.getByText('Write a letter'));
  fireEvent.click(document.querySelectorAll('.select-trigger')[0] as HTMLElement);
  // A hidden template is one the shop retired; offering it would undo that.
  expect(await screen.findAllByRole('option')).toHaveLength(1);
});

it('offers writing one only to somebody who may', async () => {
  permissions = [PERMISSIONS.EMPLOYEE_VIEW];
  await mount();
  expect(screen.queryByText('Write a letter')).toBeNull();
});

it('says so plainly when nobody has been given one', async () => {
  apiMock.letters.mockResolvedValue([]);
  await mount();
  expect(await screen.findByText('No letters yet')).toBeInTheDocument();
});
