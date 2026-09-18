import { act, render, screen, fireEvent } from '@testing-library/react';
import ReleasesPage from './page';

const apiMock: Record<string, jest.Mock> = {
  releases: jest.fn(),
  versionGates: jest.fn(),
  rollbackRelease: jest.fn(),
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
  apiMock.rollbackRelease.mockResolvedValue({ rolledBackTo: null });
  // Rolling back asks before it acts, so the prompt has to answer something.
  window.confirm = jest.fn(() => true);
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

    // development, not "staging": the environment is staging, the channel it
    // serves is development, and only a channel a binary carries exists here.
    await act(async () => {
      fireEvent.click(screen.getByText('development'));
    });
    expect(apiMock.releases).toHaveBeenLastCalledWith({ channel: 'development' });
  });
});

describe('publishing a draft that something newer has overtaken', () => {
  const draft = release({ id: 'old', sequence: 1, status: 'DRAFT' });
  const live = release({ id: 'new', sequence: 2, status: 'PUBLISHED', rolloutPercent: 100 });

  it('publishes plainly when nothing newer is live', async () => {
    await open([draft]);
    await act(async () => {
      fireEvent.click(screen.getByText('Publish to 5%'));
    });
    expect(apiMock.updateRelease).toHaveBeenCalledWith('old', {
      status: 'PUBLISHED',
      rolloutPercent: 5,
    });
  });

  /*
   * Only one release is live per slot, so publishing this one retires the
   * newer one. The button used to say "Publish to 5%" and nothing else, which
   * reads like moving forwards while doing the opposite.
   */
  it('says what publishing it would retire', async () => {
    await open([live, draft]);
    expect(screen.getByTestId('supersedes-old')).toHaveTextContent(
      /OTA 2 is live at 100% and is newer than this/,
    );
  });

  it('names the consequence on the button itself', async () => {
    await open([live, draft]);
    expect(screen.getByText('Publish anyway, retiring OTA 2')).toBeInTheDocument();
  });

  it('asks before doing it', async () => {
    (window.confirm as jest.Mock).mockReturnValue(false);
    await open([live, draft]);
    await act(async () => {
      fireEvent.click(screen.getByText('Publish anyway, retiring OTA 2'));
    });
    expect(apiMock.updateRelease).not.toHaveBeenCalled();
  });

  it('goes ahead when that is confirmed, since it is sometimes what you want', async () => {
    // A newer release can be bad and the older draft the only way back, when
    // nothing older was ever published for Roll back to find.
    (window.confirm as jest.Mock).mockReturnValue(true);
    await open([live, draft]);
    await act(async () => {
      fireEvent.click(screen.getByText('Publish anyway, retiring OTA 2'));
    });
    expect(apiMock.updateRelease).toHaveBeenCalledWith('old', {
      status: 'PUBLISHED',
      rolloutPercent: 5,
    });
  });

  it('says nothing about a newer release on another platform', async () => {
    const otherPlatform = release({
      id: 'android', sequence: 9, status: 'PUBLISHED', platform: 'android',
    });
    await open([otherPlatform, draft]);
    expect(screen.queryByTestId('supersedes-old')).toBeNull();
  });

  it('says nothing about a newer release built for another runtime', async () => {
    // A bundle for a different runtime cannot run on this binary, so it is not
    // in the same slot and retires nothing.
    const otherRuntime = release({
      id: 'rt2', sequence: 9, status: 'PUBLISHED', runtimeVersion: '2',
    });
    await open([otherRuntime, draft]);
    expect(screen.queryByTestId('supersedes-old')).toBeNull();
  });
});

describe('forcing everyone onto the newest build', () => {
  const gate = (over: Record<string, unknown> = {}) => ({
    id: 'g1',
    platform: 'ios',
    channel: 'production',
    latestBuild: 29827684,
    latestVersionName: '1.2.0',
    latestIsLive: true,
    minSupportedBuild: 0,
    storeUrl: 'https://apps.apple.com/app/id1',
    updatedAt: '2026-09-17T00:00:00.000Z',
    ...over,
  });

  it('says plainly that nobody is being forced', async () => {
    await open([release()], [gate()]);
    expect(screen.getAllByText('not forcing').length).toBeGreaterThan(0);
  });

  it('says so when they are', async () => {
    await open([release()], [gate({ minSupportedBuild: 29827684 })]);
    expect(screen.getByText('forcing')).toBeInTheDocument();
  });

  /*
   * The important guard. Forcing people onto a build the store is not serving
   * yet is not an inconvenience — it is an app that will not open, with no way
   * out but waiting, and nothing on screen to say why.
   */
  it('will not force while the store is not serving that build', async () => {
    await open([release()], [gate({ latestIsLive: false })]);
    const button = screen.getByRole('button', {
      name: /Force every install below 29827684/,
    });
    expect(button).toBeDisabled();
    expect(screen.getByText(/that would be an app nobody can open/)).toBeInTheDocument();
  });

  it('asks before it does it', async () => {
    (window.confirm as jest.Mock).mockReturnValue(false);
    await open([release()], [gate()]);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Force every install below/ }));
    });
    expect(apiMock.setVersionGate).not.toHaveBeenCalled();
  });

  it('raises the minimum to the newest build, and changes nothing else', async () => {
    (window.confirm as jest.Mock).mockReturnValue(true);
    await open([release()], [gate()]);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Force every install below/ }));
    });
    expect(apiMock.setVersionGate).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: 'ios',
        channel: 'production',
        minSupportedBuild: 29827684,
        latestBuild: 29827684,
      }),
    );
    // Not its business: whether the store is serving it is a separate fact.
    expect(apiMock.setVersionGate.mock.calls[0][0]).not.toHaveProperty('latestIsLive');
  });

  it('is not offered once everyone is already on it', async () => {
    await open([release()], [gate({ minSupportedBuild: 29827684 })]);
    expect(screen.queryByRole('button', { name: /Force every install below/ })).toBeNull();
  });

  it('shows where the update comes from', async () => {
    await open([release()], [gate()]);
    expect(screen.getByText('https://apps.apple.com/app/id1')).toBeInTheDocument();
  });
});

describe('going back to what was running before', () => {
  it('asks first, because nobody chose the bundle they land on', async () => {
    (window.confirm as jest.Mock).mockReturnValue(false);
    await open([release({ status: 'PUBLISHED', rolloutPercent: 50 })]);

    await act(async () => {
      fireEvent.click(screen.getByText('Roll back'));
    });
    expect(apiMock.rollbackRelease).not.toHaveBeenCalled();
  });

  it('rolls back when that is confirmed', async () => {
    (window.confirm as jest.Mock).mockReturnValue(true);
    apiMock.rollbackRelease.mockResolvedValue({ rolledBackTo: release({ id: 'r0' }) });
    await open([release({ status: 'PUBLISHED', rolloutPercent: 50 })]);

    await act(async () => {
      fireEvent.click(screen.getByText('Roll back'));
    });
    expect(apiMock.rollbackRelease).toHaveBeenCalledWith('r1');
  });

  /*
   * With nothing to go back to, the app falls back to the bundle inside the
   * binary. Saying so beats silence, which reads as a restore that happened.
   */
  it('says so when there was nothing to go back to', async () => {
    (window.confirm as jest.Mock).mockReturnValue(true);
    apiMock.rollbackRelease.mockResolvedValue({ rolledBackTo: null });
    await open([release({ status: 'PUBLISHED', rolloutPercent: 50 })]);

    await act(async () => {
      fireEvent.click(screen.getByText('Roll back'));
    });
    expect(await screen.findByText(/no earlier update on this channel/)).toBeInTheDocument();
  });

  it('is not offered on a draft, which replaced nothing', async () => {
    await open([release({ status: 'DRAFT' })]);
    expect(screen.queryByText('Roll back')).not.toBeInTheDocument();
  });
});

describe('what the stores are serving', () => {
  const gate = (over: Record<string, unknown> = {}) => ({
    id: 'g1',
    platform: 'ios',
    channel: 'production',
    latestBuild: 29827484,
    latestVersionName: '1.2.0',
    latestIsLive: true,
    minSupportedBuild: 0,
    storeUrl: 'https://apps.apple.com/app/id1',
    updatedAt: '2026-09-17T00:00:00.000Z',
    ...over,
  });

  it('says plainly when nothing has shipped', async () => {
    await open();
    // Two platforms, both empty. Telling the app nothing is the right answer
    // until a build exists.
    expect(screen.getAllByText(/Nothing recorded/)).toHaveLength(2);
  });

  it('shows the build for the channel being looked at', async () => {
    await open(
      [release()],
      [gate(), gate({ id: 'g2', channel: 'staging', latestBuild: 999, latestVersionName: '9.9.9' })],
    );
    expect(screen.getByText(/Build 29827484/)).toBeInTheDocument();
    expect(screen.queryByText(/9\.9\.9/)).not.toBeInTheDocument();
  });

  it('separates a build that is uploaded from one the store is serving', async () => {
    await open([release()], [gate({ latestIsLive: false })]);
    expect(screen.getByText('uploaded, not live')).toBeInTheDocument();
    // The reason matters more than the badge: an update prompt for something
    // that cannot be downloaded is a button that does nothing.
    expect(screen.getByText(/Nobody is being offered this yet/)).toBeInTheDocument();
  });

  it('says so when the store is serving it', async () => {
    await open([release()], [gate({ latestIsLive: true })]);
    expect(screen.getByText('live on the store')).toBeInTheDocument();
    expect(screen.queryByText(/Nobody is being offered this yet/)).not.toBeInTheDocument();
  });

  it('lets somebody confirm the store went live, without touching anything else', async () => {
    await open([release()], [gate({ latestIsLive: false })]);
    await act(async () => {
      fireEvent.click(screen.getByText('It is live now'));
    });
    expect(apiMock.setVersionGate).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: 'ios',
        channel: 'production',
        latestIsLive: true,
        latestBuild: 29827484,
      }),
    );
    // Not its business: raising the floor is a separate, deliberate act.
    expect(apiMock.setVersionGate.mock.calls[0][0]).not.toHaveProperty('minSupportedBuild');
  });

  it('records a build against the channel in view', async () => {
    await open();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Store builds' }));
    });
    await act(async () => {
      fireEvent.change(field('Newest build'), { target: { value: '29827484' } });
    });
    await act(async () => {
      fireEvent.change(field('Where to get it'), {
        target: { value: 'https://apps.apple.com/app/id1' },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    expect(apiMock.setVersionGate).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: 'ios',
        channel: 'production',
        latestBuild: 29827484,
        storeUrl: 'https://apps.apple.com/app/id1',
      }),
    );
  });
});
