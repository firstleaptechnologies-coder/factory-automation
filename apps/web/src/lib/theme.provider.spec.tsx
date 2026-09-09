import { render, screen, waitFor, act } from '@testing-library/react';
import { INK_DARK, INK_LIGHT } from '@fas/shared';
import { ThemeProvider, useTheme } from './theme';

const firmTheme = jest.fn();
jest.mock('./api', () => ({ api: { firmTheme: () => firmTheme() } }));

let user: unknown = { id: 'u1', permissions: [] };
jest.mock('./auth', () => ({ useAuth: () => ({ user }) }));

let theme: ReturnType<typeof useTheme>;

function Probe() {
  theme = useTheme();
  return <span>{theme.accent}</span>;
}

function mount() {
  return render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
}

const cssVar = (name: string) => document.documentElement.style.getPropertyValue(name);

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  document.documentElement.removeAttribute('style');
  user = { id: 'u1', permissions: [] };
  firmTheme.mockResolvedValue({ accent: '#2563EB' });
});

it('starts on our own orange', async () => {
  firmTheme.mockResolvedValue({ accent: null });
  mount();
  expect(screen.getByText('#FF6B1A')).toBeInTheDocument();
});

it('paints the cached colour before the server answers', () => {
  window.localStorage.setItem('decor.accent', '#2563EB');
  firmTheme.mockReturnValue(new Promise(() => {}));
  mount();
  // A branded workspace must not flash our orange on every navigation.
  expect(screen.getByText('#2563EB')).toBeInTheDocument();
});

it('adopts the tenant’s colour from the server and remembers it', async () => {
  mount();
  await waitFor(() => expect(screen.getByText('#2563EB')).toBeInTheDocument());
  expect(window.localStorage.getItem('decor.accent')).toBe('#2563EB');
});

it('does not ask for a theme before anyone has signed in', () => {
  user = null;
  mount();
  expect(firmTheme).not.toHaveBeenCalled();
});

it('does not ask for a tenant theme as a platform admin', () => {
  user = { id: 'p1', isPlatform: true };
  mount();
  // A platform admin belongs to no workspace.
  expect(firmTheme).not.toHaveBeenCalled();
});

it('keeps the last colour when the server cannot be reached', async () => {
  window.localStorage.setItem('decor.accent', '#2563EB');
  firmTheme.mockRejectedValue(new Error('offline'));
  mount();
  await waitFor(() => expect(screen.getByText('#2563EB')).toBeInTheDocument());
});

it('ignores a colour the server sends that is not one', async () => {
  firmTheme.mockResolvedValue({ accent: 'chartreuse' });
  mount();
  await waitFor(() => expect(firmTheme).toHaveBeenCalled());
  expect(screen.getByText('#FF6B1A')).toBeInTheDocument();
});

describe('painting', () => {
  it('writes the whole ramp, not just the accent', async () => {
    mount();
    await waitFor(() => expect(cssVar('--accent')).toBe('#2563EB'));
    for (const name of [
      '--accent-bright',
      '--accent-deep',
      '--accent-glow',
      '--glow',
      '--glow-soft',
      '--grad-accent',
      '--grad-accent-soft',
      '--text-on-accent',
    ]) {
      expect(cssVar(name)).not.toBe('');
    }
  });

  it('lightens and darkens around the chosen colour', async () => {
    mount();
    await waitFor(() => expect(cssVar('--accent')).toBe('#2563EB'));
    expect(cssVar('--accent-bright')).not.toBe(cssVar('--accent-deep'));
  });

  it('puts dark text on a pale brand colour', async () => {
    firmTheme.mockResolvedValue({ accent: '#FFF176' });
    mount();
    // White on a pale brand yellow is unreadable.
    await waitFor(() => expect(cssVar('--text-on-accent')).toBe(INK_DARK));
  });

  it('puts white text on a dark brand colour', async () => {
    firmTheme.mockResolvedValue({ accent: '#1F3A8A' });
    mount();
    await waitFor(() => expect(cssVar('--text-on-accent')).toBe(INK_LIGHT));
  });
});

describe('setAccent', () => {
  it('repaints and remembers what the admin picked', async () => {
    mount();
    await waitFor(() => expect(screen.getByText('#2563EB')).toBeInTheDocument());
    act(() => theme.setAccent('#0af'));
    expect(screen.getByText('#00AAFF')).toBeInTheDocument();
    expect(window.localStorage.getItem('decor.accent')).toBe('#00AAFF');
  });

  it('refuses anything that is not plainly a colour', async () => {
    mount();
    await waitFor(() => expect(screen.getByText('#2563EB')).toBeInTheDocument());
    act(() => theme.setAccent('red; background: url(x)'));
    // The value is written straight onto a CSS custom property.
    expect(screen.getByText('#2563EB')).toBeInTheDocument();
    expect(window.localStorage.getItem('decor.accent')).toBe('#2563EB');
  });
});

it('works outside the provider, so a stray component does not crash', () => {
  render(<Probe />);
  expect(screen.getByText('#FF6B1A')).toBeInTheDocument();
});
