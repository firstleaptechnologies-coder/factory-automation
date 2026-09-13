import { fireEvent, render, screen } from '@testing-library/react';
import SettingsPage from './page';

jest.mock('@/components/Shell', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const signOut = jest.fn();
let user: Record<string, unknown> | null;
jest.mock('@/lib/auth', () => ({ useAuth: () => ({ user, signOut }) }));

beforeEach(() => {
  jest.clearAllMocks();
  user = { id: 'u1', name: 'Nakul Varshney', code: 'ADMIN', role: 'ADMIN', roleName: 'Owner' };
});

const mount = () => render(<SettingsPage />);

it('says who is signed in', () => {
  mount();

  expect(screen.getByText('Nakul Varshney')).toBeInTheDocument();
  // The role a tenant renamed, not the enum underneath it.
  expect(screen.getByText('ADMIN · Owner')).toBeInTheDocument();
});

it('falls back to the role when nobody renamed it', () => {
  user = { id: 'u1', name: 'Priya', code: 'PROD01', role: 'PRODUCTION' };
  mount();

  expect(screen.getByText('PROD01 · PRODUCTION')).toBeInTheDocument();
});

it('survives a session that has not loaded yet', () => {
  user = null;
  mount();

  // Better an empty row than a screen that throws on the way to signing out.
  expect(screen.getAllByText('—').length).toBeGreaterThan(0);
});

describe('the display unit', () => {
  it('starts on the default, and says what it does not change', () => {
    mount();

    expect(screen.getByText('ft').closest('button')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByText(/always stored in millimetres/)).toBeInTheDocument();
  });

  it('offers every unit the shop might think in', () => {
    mount();

    for (const label of ['mm', 'cm', 'm', 'in', 'ft']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('remembers the choice, which is the whole reason this page exists', () => {
    mount();

    fireEvent.click(screen.getByText('cm'));

    expect(screen.getByText('cm').closest('button')).toHaveAttribute('data-selected', 'true');
    // The same key the app writes, so a shop on both does not say it twice.
    expect(window.localStorage.getItem('fas.unit')).toBe('CM');
  });

  it('opens on what was chosen last time rather than the default', () => {
    window.localStorage.setItem('fas.unit', 'MM');
    mount();

    expect(screen.getByText('mm').closest('button')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByText('ft').closest('button')).toHaveAttribute('data-selected', 'false');
  });
});

describe('about this browser', () => {
  it('names the server it is talking to, without the api path', () => {
    mount();

    // So somebody can say which one down the phone.
    expect(screen.getByText('http://localhost:3001')).toBeInTheDocument();
  });

  it('shows the code and role it is signed in with', () => {
    mount();

    expect(screen.getByText('Signed in as')).toBeInTheDocument();
    expect(screen.getByText('ADMIN')).toBeInTheDocument();
  });
});

it('signs out', () => {
  mount();

  fireEvent.click(screen.getByText('Sign out'));

  expect(signOut).toHaveBeenCalled();
});
