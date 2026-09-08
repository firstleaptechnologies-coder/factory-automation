import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { PERMISSIONS } from '@decor/shared';
import { EmployeeLettersScreen } from './EmployeeLettersScreen';

const mockEmployee = jest.fn();
const mockLetters = jest.fn();
const mockTemplates = jest.fn();
const mockDraft = jest.fn();
const mockIssue = jest.fn();
jest.mock('../api/client', () => ({
  api: {
    employee: (...a: unknown[]) => mockEmployee(...a),
    letters: (...a: unknown[]) => mockLetters(...a),
    letterTemplates: () => mockTemplates(),
    letterDraft: (...a: unknown[]) => mockDraft(...a),
    issueLetter: (...a: unknown[]) => mockIssue(...a),
    letterDocumentUrl: (id: string) => `http://api.test/letters/${id}/document`,
  },
}));

let mockPermissions: string[] = [];
jest.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ can: (p: string) => mockPermissions.includes(p) }),
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

const navigation = { goBack: jest.fn(), navigate: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockPermissions = [PERMISSIONS.EMPLOYEE_VIEW, PERMISSIONS.EMPLOYEE_MANAGE];
  mockEmployee.mockResolvedValue({ id: 'e1', name: 'Ramesh Kumar', code: 'EMP-0001' });
  mockLetters.mockResolvedValue([LETTER]);
  mockTemplates.mockResolvedValue([TEMPLATE, { ...TEMPLATE, id: 't2', isActive: false }]);
  mockDraft.mockResolvedValue({
    kind: 'OFFER',
    title: 'Offer — Ramesh Kumar',
    body: 'Dear Ramesh Kumar, we are pleased to offer you the post of CNC operator.',
  });
  mockIssue.mockResolvedValue(LETTER);
});

const mount = async () => {
  await render(
    <EmployeeLettersScreen
      navigation={navigation as never}
      route={{ params: { id: 'e1' } } as never}
    />,
  );
  await waitFor(() => expect(mockLetters).toHaveBeenCalled());
};

it('lists what somebody has been given', async () => {
  await mount();
  expect(await screen.findByText('Offer — Ramesh Kumar')).toBeTruthy();
  expect(screen.getByText(/Offer letter · /)).toBeTruthy();
});

it('opens the printed letter on the shop’s letterhead', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
  await mount();
  await fireEvent.press(await screen.findByText('Offer — Ramesh Kumar'));
  expect(open).toHaveBeenCalledWith('http://api.test/letters/l1/document');
  open.mockRestore();
});

it('drafts the wording from the server, filled in for this person', async () => {
  await mount();
  await fireEvent.press(screen.getByTestId('write-letter'));
  await fireEvent(screen.getAllByTestId('select-trigger')[0], 'touchEnd');
  await fireEvent.press(await screen.findByText('Offer letter · Offer'));

  // The preview somebody reads and the letter that is filed come from the same
  // substitution, on the server.
  await waitFor(() => expect(mockDraft).toHaveBeenCalledWith('t1', 'e1'));
  expect(await screen.findByDisplayValue(/post of CNC operator/)).toBeTruthy();
});

it('files the body as it stands, not the template it came from', async () => {
  await mount();
  await fireEvent.press(screen.getByTestId('write-letter'));
  await fireEvent(screen.getAllByTestId('select-trigger')[0], 'touchEnd');
  await fireEvent.press(await screen.findByText('Offer letter · Offer'));
  await waitFor(() => expect(mockDraft).toHaveBeenCalled());

  await fireEvent.changeText(
    screen.getByTestId('letter-body'),
    'Dear Ramesh Kumar, the post is yours from Monday.',
  );
  await fireEvent.press(screen.getByText('File it'));

  await waitFor(() =>
    expect(mockIssue).toHaveBeenCalledWith(
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
  await fireEvent.press(screen.getByTestId('write-letter'));
  await fireEvent(screen.getAllByTestId('select-trigger')[0], 'touchEnd');
  // A hidden template is one the shop retired; offering it would undo that.
  expect(await screen.findAllByText('Offer letter · Offer')).toHaveLength(1);
});

it('offers writing one only to somebody who may', async () => {
  mockPermissions = [PERMISSIONS.EMPLOYEE_VIEW];
  await mount();
  expect(screen.queryByTestId('write-letter')).toBeNull();
});

it('says so plainly when nobody has been given one', async () => {
  mockLetters.mockResolvedValue([]);
  await mount();
  expect(await screen.findByText('No letters yet')).toBeTruthy();
});
