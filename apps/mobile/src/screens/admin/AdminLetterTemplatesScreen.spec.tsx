import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AdminLetterTemplatesScreen } from './AdminLetterTemplatesScreen';

const mockTemplates = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
jest.mock('../../api/client', () => ({
  api: {
    letterTemplates: () => mockTemplates(),
    createLetterTemplate: (...a: unknown[]) => mockCreate(...a),
    updateLetterTemplate: (...a: unknown[]) => mockUpdate(...a),
  },
}));

const TEMPLATE = {
  id: 't1',
  kind: 'OFFER',
  name: 'Offer',
  body: 'Dear {{name}}, we are pleased to offer you the post of {{designation}}.',
  isActive: true,
};

const navigation = { goBack: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockTemplates.mockResolvedValue([TEMPLATE]);
  mockCreate.mockResolvedValue(TEMPLATE);
  mockUpdate.mockResolvedValue(TEMPLATE);
});

const mount = async () => {
  await render(<AdminLetterTemplatesScreen navigation={navigation as never} />);
  await waitFor(() => expect(mockTemplates).toHaveBeenCalled());
};

it('lists the templates by what they are for', async () => {
  await mount();
  expect(await screen.findByText('Offer')).toBeTruthy();
  expect(screen.getByText('Offer letter')).toBeTruthy();
});

it('drops a placeholder in where the words go', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Offer'));
  await fireEvent.changeText(await screen.findByTestId('template-body'), 'Dear ');
  await fireEvent.press(screen.getByText('Their name'));
  expect(screen.getByTestId('template-body').props.value).toBe('Dear {{name}}');
});

it('warns about a placeholder nothing will ever fill in', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Offer'));
  await fireEvent.changeText(
    await screen.findByTestId('template-body'),
    'Dear {{name}}, your bonus is {{bonus}} and it is a long enough letter.',
  );
  // Braces printed on a page somebody hands to a bank is the sort of mistake
  // nobody notices until it has happened.
  expect(await screen.findByText(/Nothing will fill in \{\{bonus\}\}/)).toBeTruthy();
});

it('says nothing when every placeholder is one we can fill', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Offer'));
  expect(screen.queryByText(/Nothing will fill in/)).toBeNull();
});

it('saves an edit to the template it opened', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Offer'));
  await fireEvent.changeText(
    await screen.findByTestId('template-body'),
    'Dear {{name}}, the post of {{designation}} is yours from {{joinedOn}}.',
  );
  await fireEvent.press(screen.getByText('Save'));
  await waitFor(() =>
    expect(mockUpdate).toHaveBeenCalledWith('t1', expect.objectContaining({ kind: 'OFFER' })),
  );
  expect(mockCreate).not.toHaveBeenCalled();
});

it('will not save a template with nothing in it', async () => {
  await mount();
  await fireEvent.press(screen.getByText('New template'));
  await fireEvent.press(await screen.findByText('Save'));
  expect(mockCreate).not.toHaveBeenCalled();
});
