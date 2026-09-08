import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SupportBanner } from './SupportBanner';

let mockUser: Record<string, unknown> | null = null;
const mockSignOut = jest.fn();
jest.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, signOut: mockSignOut }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { name: 'Administrator' };
});

describe('the support banner', () => {
  it('is not there in an ordinary session', async () => {
    await render(<SupportBanner />);
    expect(screen.queryByTestId('support-banner')).toBeNull();
  });

  it('is not there when nobody is signed in', async () => {
    mockUser = null;
    await render(<SupportBanner />);
    expect(screen.queryByTestId('support-banner')).toBeNull();
  });

  it('names who is in here, and as whom', async () => {
    mockUser = { name: 'Administrator', impersonatedBy: { id: 'p1', name: 'Nakul' } };
    await render(<SupportBanner />);

    // A support session that looks like an ordinary one is how a shop ends up
    // believing its own admin did something.
    expect(screen.getByText('Nakul')).toBeTruthy();
    expect(screen.getByText(/as Administrator/)).toBeTruthy();
    expect(screen.getByText(/recorded under that name/)).toBeTruthy();
  });

  it('offers the way out', async () => {
    mockUser = { name: 'Administrator', impersonatedBy: { id: 'p1', name: 'Nakul' } };
    await render(<SupportBanner />);
    await fireEvent.press(screen.getByText('Leave'));
    expect(mockSignOut).toHaveBeenCalled();
  });
});
