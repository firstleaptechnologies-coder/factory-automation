import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoginPage from './page';

const workspaceExists = jest.fn();
jest.mock('@/lib/api', () => ({
  api: { workspaceExists: (slug: string) => workspaceExists(slug) },
}));

const signIn = jest.fn();
const signInAsPlatform = jest.fn();
const forgetWorkspace = jest.fn();
let auth: Record<string, unknown>;
jest.mock('@/lib/auth', () => ({ useAuth: () => auth }));

const field = (label: string) =>
  Array.from(document.querySelectorAll('label.field'))
    .find((node) => node.querySelector('.field-label')?.textContent?.startsWith(label))!
    .querySelector('input') as HTMLInputElement;

beforeEach(() => {
  jest.clearAllMocks();
  auth = { workspace: null, user: null, signIn, signInAsPlatform, forgetWorkspace };
  workspaceExists.mockResolvedValue({ exists: true, slug: 'decorbucket' });
  signIn.mockResolvedValue({});
  signInAsPlatform.mockResolvedValue({});
});

describe('which shop', () => {
  it('asks for the workspace before anything else', async () => {
    render(<LoginPage />);
    // An employee code means nothing until you know which business it belongs
    // to — two shops can both have an ADMIN.
    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(screen.queryByText('Password')).not.toBeInTheDocument();
  });

  it('will not continue with nothing typed', () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByText('Continue'));
    expect(workspaceExists).not.toHaveBeenCalled();
  });

  it('checks it in lower case, however it was typed', async () => {
    render(<LoginPage />);
    fireEvent.change(field('Workspace'), { target: { value: '  DecorBucket ' } });
    fireEvent.click(screen.getByText('Continue'));
    await waitFor(() => expect(workspaceExists).toHaveBeenCalledWith('decorbucket'));
  });

  it('says so when there is no such workspace, while the typo is still obvious', async () => {
    workspaceExists.mockResolvedValue({ exists: false });
    render(<LoginPage />);
    fireEvent.change(field('Workspace'), { target: { value: 'decorbukket' } });
    fireEvent.click(screen.getByText('Continue'));
    expect(await screen.findByText('No workspace called "decorbukket"')).toBeInTheDocument();
    expect(screen.queryByText('Password')).not.toBeInTheDocument();
  });

  it('says so when the server cannot be reached at all', async () => {
    workspaceExists.mockRejectedValue(new Error('Network down'));
    render(<LoginPage />);
    fireEvent.change(field('Workspace'), { target: { value: 'decorbucket' } });
    fireEvent.click(screen.getByText('Continue'));
    expect(await screen.findByText('Network down')).toBeInTheDocument();
  });

  it('asks for a code and password once the workspace is known', async () => {
    render(<LoginPage />);
    fireEvent.change(field('Workspace'), { target: { value: 'decorbucket' } });
    fireEvent.click(screen.getByText('Continue'));
    expect(await screen.findByText('Employee code')).toBeInTheDocument();
    expect(screen.getByText('Password')).toBeInTheDocument();
  });

  it('goes straight to the password for a browser that has been here before', () => {
    auth = { ...auth, workspace: 'decorbucket' };
    render(<LoginPage />);
    // The same browser almost always belongs to the same shop.
    expect(screen.getByText('Employee code')).toBeInTheDocument();
    expect(screen.getByText('decorbucket')).toBeInTheDocument();
  });

  it('lets the remembered workspace be changed', () => {
    auth = { ...auth, workspace: 'decorbucket' };
    render(<LoginPage />);
    fireEvent.click(screen.getByText('change'));
    expect(forgetWorkspace).toHaveBeenCalled();
    expect(screen.getByText('Workspace')).toBeInTheDocument();
  });
});

describe('signing in', () => {
  const atCredentials = async () => {
    auth = { ...auth, workspace: 'decorbucket' };
    render(<LoginPage />);
    await screen.findByText('Employee code');
  };

  it('will not submit without both a code and a password', async () => {
    await atCredentials();
    fireEvent.click(screen.getByText('Sign in'));
    expect(signIn).not.toHaveBeenCalled();
    fireEvent.change(field('Employee code'), { target: { value: 'ADMIN' } });
    fireEvent.click(screen.getByText('Sign in'));
    expect(signIn).not.toHaveBeenCalled();
  });

  it('signs in against the workspace, trimmed and lower-cased', async () => {
    await atCredentials();
    fireEvent.change(field('Employee code'), { target: { value: ' ADMIN ' } });
    fireEvent.change(field('Password'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByText('Sign in'));
    await waitFor(() => expect(signIn).toHaveBeenCalledWith('decorbucket', 'ADMIN', 'secret'));
  });

  it('hides the password as it is typed', async () => {
    await atCredentials();
    expect(field('Password')).toHaveAttribute('type', 'password');
  });

  it('says why a sign-in was refused', async () => {
    signIn.mockRejectedValue(new Error('Wrong code or password'));
    await atCredentials();
    fireEvent.change(field('Employee code'), { target: { value: 'ADMIN' } });
    fireEvent.change(field('Password'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByText('Sign in'));
    expect(await screen.findByText('Wrong code or password')).toBeInTheDocument();
  });

  it('submits on Enter from the password field', async () => {
    await atCredentials();
    fireEvent.change(field('Employee code'), { target: { value: 'ADMIN' } });
    fireEvent.change(field('Password'), { target: { value: 'secret' } });
    fireEvent.keyDown(field('Password'), { key: 'Enter' });
    await waitFor(() => expect(signIn).toHaveBeenCalled());
  });
});

describe('platform administration', () => {
  it('asks for an email rather than an employee code', () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByText('Platform administration'));
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.queryByText('Workspace')).not.toBeInTheDocument();
  });

  it('signs in with no workspace at all', async () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByText('Platform administration'));
    fireEvent.change(field('Email'), { target: { value: ' admin@decorbucket.app ' } });
    fireEvent.change(field('Password'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByText('Sign in'));
    await waitFor(() =>
      expect(signInAsPlatform).toHaveBeenCalledWith('admin@decorbucket.app', 'secret'),
    );
    expect(signIn).not.toHaveBeenCalled();
  });

  it('goes back to asking which shop', () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByText('Platform administration'));
    fireEvent.click(screen.getByText('Back to workspace sign in'));
    expect(screen.getByText('Workspace')).toBeInTheDocument();
  });

  it('goes back to the remembered workspace when there is one', () => {
    auth = { ...auth, workspace: 'decorbucket' };
    render(<LoginPage />);
    fireEvent.click(screen.getByText('Platform administration'));
    fireEvent.click(screen.getByText('Back to workspace sign in'));
    expect(screen.getByText('Employee code')).toBeInTheDocument();
  });

  it('forgets what was typed when the mode changes', () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByText('Platform administration'));
    fireEvent.change(field('Email'), { target: { value: 'admin@decorbucket.app' } });
    fireEvent.click(screen.getByText('Back to workspace sign in'));
    fireEvent.click(screen.getByText('Platform administration'));
    expect(field('Email')).toHaveValue('');
  });
});

/*
 * Where a signed-in person is sent is decided by `landingFor`, which has its
 * own spec — jsdom will not allow `location` to be replaced, so the navigation
 * itself is not asserted here.
 */
