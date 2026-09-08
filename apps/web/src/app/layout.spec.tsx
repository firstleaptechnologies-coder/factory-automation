import { render, screen } from '@testing-library/react';
import RootLayout, { metadata } from './layout';

jest.mock('@/lib/auth', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="auth">{children}</div>
  ),
}));

jest.mock('@/lib/theme', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="theme">{children}</div>
  ),
}));

it('names the app for the browser tab and for search', () => {
  expect(metadata.title).toBe('Decor Bucket ERP');
  expect(metadata.description).toContain('CNC decor unit');
});

it('wraps every page in the session before the theme', () => {
  // The theme is the tenant's, so it can only be resolved once there is a
  // signed-in user to read it from.
  render(<RootLayout><span>page</span></RootLayout>, {
    container: document.documentElement,
  });
  expect(screen.getByTestId('auth')).toContainElement(screen.getByTestId('theme'));
  expect(screen.getByTestId('theme')).toHaveTextContent('page');
});
