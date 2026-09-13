import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SettingsScreen, serverLabel } from './SettingsScreen';

const mockSignOut = jest.fn();
let mockUser: Record<string, unknown> | null = null;
jest.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, signOut: mockSignOut }),
}));

const storage = AsyncStorage as unknown as { getItem: jest.Mock; setItem: jest.Mock };

const goBack = jest.fn();
const mount = () => render(<SettingsScreen navigation={{ goBack }} />);

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { name: 'Nakul', code: 'ADMIN', role: 'ADMIN' };
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
  await waitFor(() => expect(storage.setItem).toHaveBeenCalledWith('fas.unit', 'MM'));
});

it('says which server the app is talking to', async () => {
  await mount();
  expect(screen.getByText('Server')).toBeTruthy();
  expect(screen.getByText('http://localhost:3001')).toBeTruthy();
});

/*
 * The role in the shop's own words, the way the browser shows it.
 *
 * A tenant can rename its roles, and this screen was showing the enum: the one
 * place that tells somebody who they are called them something nobody in the
 * shop says.
 */
describe('the role', () => {
  it('is the name the shop gave it', async () => {
    mockUser = { name: 'Priya', code: 'PROD01', role: 'PRODUCTION', roleName: 'Karigar' };
    await mount();

    expect(screen.getByText('PROD01 · Karigar')).toBeTruthy();
    expect(screen.getByText('Karigar')).toBeTruthy();
  });

  it('falls back to the role underneath when nobody renamed it', async () => {
    await mount();

    expect(screen.getByText('ADMIN · ADMIN')).toBeTruthy();
  });
});

/*
 * The value somebody reads down the phone when a shop asks which server it is
 * on. `replace('/api', '')` took the first match anywhere, so an API at
 * `https://api.example.com/api` came out as `https:/.example.com/api`.
 */
describe('the server it names', () => {
  it('strips the api path from the end, not from the host', () => {
    // The obvious name for the host is the one that used to break it.
    expect(serverLabel('https://api.example.com/api')).toBe('https://api.example.com');
    expect(serverLabel('https://api.fas.co.in/api/')).toBe('https://api.fas.co.in');
  });

  it('leaves a host that merely contains the word alone', () => {
    expect(serverLabel('https://fas-api.vercel.app/api')).toBe('https://fas-api.vercel.app');
  });

  it('leaves a URL with no api path exactly as it is', () => {
    expect(serverLabel('https://fas.co.in')).toBe('https://fas.co.in');
  });

  it('is what the row actually shows', () => {
    // Otherwise this tests a function the screen might not be calling.
    expect(serverLabel()).toBe('http://localhost:3001');
  });
});

it('survives a session that has not loaded yet', async () => {
  mockUser = null;
  await mount();

  // Better an empty row than a screen that throws on the way to signing out.
  expect(screen.getAllByText('—').length).toBeGreaterThan(0);
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
