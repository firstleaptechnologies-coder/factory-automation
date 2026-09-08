import { act, render, screen, fireEvent } from '@testing-library/react';
import ReleasesPage from './page';

const apiMock: Record<string, jest.Mock> = {
  releases: jest.fn(),
  versionGates: jest.fn(),
  updateRelease: jest.fn(),
  setVersionGate: jest.fn(),
};
jest.mock('@/lib/api', () => ({
  api: new Proxy({}, { get: (_t, key: string) => (...args: unknown[]) => apiMock[key](...args) }),
}));

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: push }) }));

jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { id: 'p1', isPlatform: true }, loading: false, signOut: jest.fn() }),
}));

/** The Field component wraps its label; there is no htmlFor to query by. */
const field = (label: string) =>
  Array.from(document.querySelectorAll('label.field'))
    .find((node) => node.querySelector('.field-label')?.textContent?.startsWith(label))!
    .querySelector('input') as HTMLInputElement;

const release = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  channel: 'production',
  runtimeVersion: '1.0.0',
  platform: 'ios',
  kind: 'UPDATE',
  status: 'PUBLISHED',
  rolloutPercent: 5,
  sequence: 7,
  changelog: 'Fix the punch screen',
  createdAt: '2026-09-08T10:00:00.000Z',
  _count: { assets: 12 },
  ...over,
});

const open = async (releases: unknown[] = [release()], gates: unknown[] = []) => {
  apiMock.releases.mockResolvedValue(releases);
  apiMock.versionGates.mockResolvedValue(gates);
  await act(async () => {
    render(<ReleasesPage />);
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  apiMock.updateRelease.mockResolvedValue({});
  apiMock.setVersionGate.mockResolvedValue({});
});

describe('the release list', () => {
  it('says which build it is, in the words the app shows', async () => {
    await open();
    // "OTA 7", so nobody has to read a UUID over the phone.
    expect(screen.getByText('OTA 7 · ios')).toBeInTheDocument();
    expect(screen.getByText(/runtime 1.0.0/)).toBeInTheDocument();
  });

  it('shows how far a rollout has been walked', async () => {
    await open();
    expect(screen.getByText('5% of installs')).toBeInTheDocument();
  });

  it('offers only the steps above where it already is', async () => {
    await open([release({ rolloutPercent: 25 })]);
    // Sticky buckets mean a rollout only ever goes up; offering 10% would be
    // offering to take it away from people who have it.
    expect(screen.queryByText('10%')).not.toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('walks a rollout up', async () => {
    await open();
    await act(async () => {
      fireEvent.click(screen.getByText('25%'));
    });
    expect(apiMock.updateRelease).toHaveBeenCalledWith('r1', { rolloutPercent: 25 });
  });

  it('puts a draft in front of a few people first', async () => {
    await open([release({ status: 'DRAFT', rolloutPercent: 0 })]);
    await act(async () => {
      fireEvent.click(screen.getByText('Publish to 5%'));
    });
    expect(apiMock.updateRelease).toHaveBeenCalledWith('r1', {
      status: 'PUBLISHED',
      rolloutPercent: 5,
    });
  });

  it('retires one', async () => {
    await open();
    await act(async () => {
      fireEvent.click(screen.getByText('Retire'));
    });
    expect(apiMock.updateRelease).toHaveBeenCalledWith('r1', { status: 'ARCHIVED' });
  });

  it('marks a rollback as the different thing it is', async () => {
    await open([release({ kind: 'ROLLBACK' })]);
    expect(screen.getByText('Rollback')).toBeInTheDocument();
  });

  it('says plainly when a channel has nothing on it', async () => {
    await open([]);
    expect(screen.getByText('Nothing published on this channel')).toBeInTheDocument();
  });

  it('asks for the channel that is selected', async () => {
    await open();
    expect(apiMock.releases).toHaveBeenCalledWith({ channel: 'production' });

    await act(async () => {
      fireEvent.click(screen.getByText('staging'));
    });
    expect(apiMock.releases).toHaveBeenLastCalledWith({ channel: 'staging' });
  });
});

describe('the version floor', () => {
  it('says when there is none', async () => {
    await open();
    expect(screen.getByText(/No floor set/)).toBeInTheDocument();
  });

  it('shows the floor for the channel being looked at', async () => {
    await open(
      [release()],
      [
        {
          id: 'g1',
          platform: 'ios',
          channel: 'production',
          minimumVersion: '1.2.0',
          recommendedVersion: '1.4.0',
        },
        { id: 'g2', platform: 'ios', channel: 'staging', minimumVersion: '9.9.9' },
      ],
    );

    expect(screen.getByText(/must be 1.2.0/)).toBeInTheDocument();
    expect(screen.queryByText(/9.9.9/)).not.toBeInTheDocument();
  });

  it('sets one for the channel in view', async () => {
    await open();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Version floor' }));
    });
    await act(async () => {
      fireEvent.change(field('Must be at least'), { target: { value: '1.2.0' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Set the floor'));
    });

    expect(apiMock.setVersionGate).toHaveBeenCalledWith({
      platform: 'ios',
      channel: 'production',
      minimumVersion: '1.2.0',
      recommendedVersion: undefined,
      message: undefined,
    });
  });
});
