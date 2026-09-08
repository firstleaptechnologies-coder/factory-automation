import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { LoginScreen } from './LoginScreen';

const mockWorkspaceExists = jest.fn();
jest.mock('../api/client', () => ({
  api: { workspaceExists: (...args: unknown[]) => mockWorkspaceExists(...args) },
}));

const mockSignIn = jest.fn();
const mockSignInAsPlatform = jest.fn();
let mockSavedWorkspace: string | null = null;
jest.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    signIn: (...args: unknown[]) => mockSignIn(...args),
    signInAsPlatform: (...args: unknown[]) => mockSignInAsPlatform(...args),
    workspace: mockSavedWorkspace,
  }),
}));
const signIn = mockSignIn;
const signInAsPlatform = mockSignInAsPlatform;

const mount = () => render(<LoginScreen />);

const buttonFor = (title: string) => screen.getByText(title);
const passwordField = () => screen.getByPlaceholderText('••••••••');

beforeEach(() => {
  jest.clearAllMocks();
  mockSavedWorkspace = null;
  mockWorkspaceExists.mockResolvedValue({ slug: 'decorbucket', exists: true });
  signIn.mockResolvedValue(undefined);
  signInAsPlatform.mockResolvedValue(undefined);
});

it('asks for the workspace first', async () => {
  await mount();
  // An employee code means nothing until you know which business it belongs to.
  expect(screen.getByPlaceholderText('your-shop')).toBeTruthy();
  expect(screen.queryByPlaceholderText('e.g. ADMIN')).toBeNull();
});

it('cannot continue without a workspace', async () => {
  await mount();
  await fireEvent.press(buttonFor('Continue'));
  expect(mockWorkspaceExists).not.toHaveBeenCalled();
});

it('checks the workspace before asking for a password', async () => {
  await mount();
  await fireEvent.changeText(screen.getByPlaceholderText('your-shop'), 'DecorBucket');
  await fireEvent.press(buttonFor('Continue'));
  await waitFor(() => expect(mockWorkspaceExists).toHaveBeenCalledWith('decorbucket'));
  // A typo is caught while it is still obvious what went wrong.
  expect(await screen.findByPlaceholderText('e.g. ADMIN')).toBeTruthy();
});

it('says so when the workspace does not exist, and stays put', async () => {
  mockWorkspaceExists.mockRejectedValue(new Error('No workspace found for "nope"'));
  await mount();
  await fireEvent.changeText(screen.getByPlaceholderText('your-shop'), 'nope');
  await fireEvent.press(buttonFor('Continue'));
  expect(await screen.findByText('No workspace found for "nope"')).toBeTruthy();
  expect(screen.queryByPlaceholderText('e.g. ADMIN')).toBeNull();
});

it('skips straight to the password on a device that has signed in before', async () => {
  mockSavedWorkspace = 'decorbucket';
  await mount();
  // The shop only ever types the workspace once.
  expect(await screen.findByPlaceholderText('e.g. ADMIN')).toBeTruthy();
  expect(screen.getByText('decorbucket')).toBeTruthy();
});

it('lets a device move to another workspace', async () => {
  mockSavedWorkspace = 'decorbucket';
  await mount();
  await screen.findByPlaceholderText('e.g. ADMIN');
  await fireEvent.press(screen.getByText('change'));
  expect(screen.getByPlaceholderText('your-shop')).toBeTruthy();
});

it('cannot sign in without both a code and a password', async () => {
  mockSavedWorkspace = 'decorbucket';
  await mount();
  await fireEvent.changeText(await screen.findByPlaceholderText('e.g. ADMIN'), 'ADMIN');
  await fireEvent.press(buttonFor('Sign in'));
  expect(signIn).not.toHaveBeenCalled();
});

it('signs in with the workspace, code and password', async () => {
  mockSavedWorkspace = 'decorbucket';
  await mount();
  await fireEvent.changeText(await screen.findByPlaceholderText('e.g. ADMIN'), ' admin ');
  await fireEvent.changeText(screen.getByPlaceholderText('••••••••'), 'admin123');
  await fireEvent.press(buttonFor('Sign in'));
  await waitFor(() => expect(signIn).toHaveBeenCalledWith('decorbucket', 'admin', 'admin123'));
});

it('shows the server’s message on a bad sign-in and lets the person try again', async () => {
  signIn.mockRejectedValue(new Error('Wrong code or password'));
  mockSavedWorkspace = 'decorbucket';
  await mount();
  await fireEvent.changeText(await screen.findByPlaceholderText('e.g. ADMIN'), 'ADMIN');
  await fireEvent.changeText(screen.getByPlaceholderText('••••••••'), 'wrong');
  await fireEvent.press(buttonFor('Sign in'));
  expect(await screen.findByText('Wrong code or password')).toBeTruthy();
});

describe('platform administration', () => {
  it('is reachable from the workspace screen', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Platform administration'));
    expect(screen.getByPlaceholderText('you@example.com')).toBeTruthy();
    expect(screen.getByText('Platform administration')).toBeTruthy();
  });

  it('signs a platform admin in by email', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Platform administration'));
    await fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), ' ops@x.com ');
    await fireEvent.changeText(passwordField(), 'pw');
    await fireEvent.press(buttonFor('Sign in to platform'));
    await waitFor(() => expect(signInAsPlatform).toHaveBeenCalledWith('ops@x.com', 'pw'));
  });

  it('clears the password when switching between the two', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Platform administration'));
    await fireEvent.changeText(passwordField(), 'secret');
    await fireEvent.press(screen.getByText('Sign in to a workspace instead'));
    await fireEvent.press(screen.getByText('Platform administration'));
    // A password typed for one door must not be carried to the other.
    expect(passwordField().props.value).toBe('');
  });

  it('goes back to the workspace screen', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Platform administration'));
    await fireEvent.press(screen.getByText('Sign in to a workspace instead'));
    expect(screen.getByPlaceholderText('your-shop')).toBeTruthy();
  });
});
