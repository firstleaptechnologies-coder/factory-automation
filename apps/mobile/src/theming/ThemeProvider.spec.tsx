import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text } from 'react-native';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { ThemeProvider, useTheme } from './ThemeProvider';
import { DEFAULT_ACCENT, palette } from '../theme';

const mockFirmTheme = jest.fn();
jest.mock('../api/client', () => ({ api: { firmTheme: () => mockFirmTheme() } }));

let mockUser: unknown = { id: 'u1', permissions: [] };
jest.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));

const storage = AsyncStorage as unknown as { getItem: jest.Mock; setItem: jest.Mock };

let theme: ReturnType<typeof useTheme>;

function Probe() {
  theme = useTheme();
  return <Text>{theme.accent}</Text>;
}

const mount = () =>
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );

beforeEach(async () => {
  jest.clearAllMocks();
  storage.getItem.mockResolvedValue(null);
  storage.setItem.mockResolvedValue(undefined);
  mockUser = { id: 'u1', permissions: [] };
  mockFirmTheme.mockResolvedValue({ accent: '#2563EB' });
  // The palette is module state that a previous test may have repainted.
  const { applyAccent } = require('../theme');
  applyAccent(DEFAULT_ACCENT);
});

it('starts on whatever the palette is already painted in', async () => {
  mockFirmTheme.mockResolvedValue({ accent: null });
  await mount();
  expect(screen.getByText(DEFAULT_ACCENT)).toBeTruthy();
});

it('paints the cached colour on launch, before the server is asked', async () => {
  storage.getItem.mockResolvedValue('#2563EB');
  mockFirmTheme.mockReturnValue(new Promise(() => {}));
  await mount();
  // A shop that has branded the app must not see our orange flash first.
  expect(await screen.findByText('#2563EB')).toBeTruthy();
});

it('refreshes from the server, because an admin may have changed it elsewhere', async () => {
  await mount();
  expect(await screen.findByText('#2563EB')).toBeTruthy();
  expect(storage.setItem).toHaveBeenCalledWith('decor.accent', '#2563EB');
});

it('does not ask for a theme before anyone has signed in', async () => {
  mockUser = null;
  await mount();
  expect(mockFirmTheme).not.toHaveBeenCalled();
});

it('does not ask for a tenant theme as a platform admin', async () => {
  mockUser = { id: 'p1', isPlatform: true };
  await mount();
  // A platform admin belongs to no workspace.
  expect(mockFirmTheme).not.toHaveBeenCalled();
});

it('keeps the last colour when the shop has no connection', async () => {
  storage.getItem.mockResolvedValue('#2563EB');
  mockFirmTheme.mockRejectedValue(new Error('offline'));
  await mount();
  expect(await screen.findByText('#2563EB')).toBeTruthy();
});

it('ignores an empty colour from the server rather than clearing the brand', async () => {
  storage.getItem.mockResolvedValue('#2563EB');
  mockFirmTheme.mockResolvedValue({ accent: '' });
  await mount();
  await waitFor(() => expect(mockFirmTheme).toHaveBeenCalled());
  expect(screen.getByText('#2563EB')).toBeTruthy();
});

it('repaints the shared palette, which every StyleSheet already points at', async () => {
  await mount();
  await screen.findByText('#2563EB');
  expect(palette.accent).toBe('#2563EB');
});

it('remounts the tree so captured styles pick the colour up', async () => {
  await mount();
  await screen.findByText('#2563EB');
  // Applying an accent mutates the palette in place; without the remount every
  // StyleSheet.create would keep the colour it froze at import.
  expect(theme.revision).toBeGreaterThan(0);
});

it('does not remount when the colour has not actually changed', async () => {
  storage.getItem.mockResolvedValue(DEFAULT_ACCENT);
  mockFirmTheme.mockResolvedValue({ accent: DEFAULT_ACCENT });
  await mount();
  await waitFor(() => expect(mockFirmTheme).toHaveBeenCalled());
  expect(theme.revision).toBe(0);
});

it('lets an admin set the colour, remembering it on the device', async () => {
  await mount();
  await screen.findByText('#2563EB');
  await act(() => theme.setAccent('#FF0000'));
  expect(storage.setItem).toHaveBeenCalledWith('decor.accent', '#FF0000');
  expect(screen.getByText('#FF0000')).toBeTruthy();
});

it('works outside the provider, so a screen rendered before it still draws', async () => {
  await render(<Probe />);
  expect(screen.getByText(palette.accent)).toBeTruthy();
  await expect(theme.setAccent('#FF0000')).resolves.toBeUndefined();
});
