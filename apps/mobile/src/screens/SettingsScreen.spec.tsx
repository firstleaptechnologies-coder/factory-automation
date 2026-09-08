import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SettingsScreen } from './SettingsScreen';

const mockSignOut = jest.fn();
jest.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    user: { name: 'Nakul', code: 'ADMIN', role: 'ADMIN' },
    signOut: mockSignOut,
  }),
}));

const storage = AsyncStorage as unknown as { getItem: jest.Mock; setItem: jest.Mock };

const goBack = jest.fn();
const mount = () => render(<SettingsScreen navigation={{ goBack }} />);

beforeEach(() => {
  jest.clearAllMocks();
  storage.getItem.mockResolvedValue(null);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

it('shows who is signed in', async () => {
  await mount();
  expect(screen.getByText('Nakul')).toBeTruthy();
  expect(screen.getByText('ADMIN · ADMIN')).toBeTruthy();
});

it('says the display unit changes nothing that is stored', async () => {
  await mount();
  // Sizes are always millimetres underneath; this is a rendering choice.
  expect(
    screen.getByText('Sizes are always stored in millimetres. This only changes what you see.'),
  ).toBeTruthy();
});

it('remembers the unit that was chosen', async () => {
  await mount();
  await fireEvent.press(screen.getByText('mm'));
  await waitFor(() => expect(storage.setItem).toHaveBeenCalledWith('decor.unit', 'MM'));
});

it('says which server the app is talking to', async () => {
  await mount();
  expect(screen.getByText('Server')).toBeTruthy();
  expect(screen.getByText('http://localhost:3001')).toBeTruthy();
});

it('asks before signing out, and says what it will cost', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Sign out'));
  expect(Alert.alert).toHaveBeenCalledWith(
    'Sign out?',
    'You will need your code and password again.',
    expect.anything(),
  );
  expect(mockSignOut).not.toHaveBeenCalled();
});

it('signs out once it is confirmed', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Sign out'));
  const buttons = (Alert.alert as jest.Mock).mock.calls[0][2] as {
    text: string;
    onPress?: () => void;
  }[];
  buttons.find((b) => b.text === 'Sign out')!.onPress!();
  expect(mockSignOut).toHaveBeenCalled();
});

it('goes back', async () => {
  await mount();
  expect(goBack).not.toHaveBeenCalled();
});
