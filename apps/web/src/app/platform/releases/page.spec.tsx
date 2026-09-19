import { act, render, screen, fireEvent, within } from '@testing-library/react';
import ReleasesPage from './page';

const apiMock: Record<string, jest.Mock> = {
  health: jest.fn(),
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

jest.mock('@/components/Shell', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

/** The Field component wraps its label; there is no htmlFor to query by. */
const field = (label: string) =>
  Array.from(document.querySelectorAll('label.field'))
    .find((node) => node.querySelector('.field-label')?.textContent?.startsWith(label))!
    .querySelector('input') as HTMLInputElement;

const release = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  channel: 'development',
  runtimeVersion: '1',
  platform: 'ios',
  kind: 'UPDATE',
  status: 'PUBLISHED',
  rolloutPercent: 20,
  sequence: 7,
  changelog: 'Fix the punch screen',
  createdAt: '2026-09-08T10:00:00.000Z',
  _count: { assets: 12 },
  ...over,
});

const page = (rows: unknown[], total = rows.length, at = 1, limit = 10) => ({
  data: rows,
  meta: { page: at, limit, total, pages: Math.max(Math.ceil(total / limit), 1) },
});

const gate = (over: Record<string, unknown> = {}) => ({
  id: 'g1',
  platform: 'ios',
  channel: 'development',
  latestBuild: 29828633,
  latestVersionName: '1.0.1',
  latestIsLive: true,
  minSupportedBuild: 0,
  storeUrl: 'https://apps.apple.com/app/id123',
  message: null,
  ...over,
});

/**
 * Releases are asked for per platform, so the mock answers per platform.
 * `ios` gets the rows under test; `android` is empty unless a test says
 * otherwise, which is also the real shape of things today.
 */
function servingReleases(byPlatform: Record<string, unknown>) {
  apiMock.releases.mockImplementation(
    async ({ platform }: { platform: string }) => byPlatform[platform] ?? page([]),
  );
}

async function open({
  ios = [release()],
  android = [] as unknown[],
  gates = [gate()] as unknown[],
  env = 'staging',
  otaChannel = 'development' as string | null,
}: {
  ios?: unknown[];
  android?: unknown[];
  gates?: unknown[];
  env?: string;
  otaChannel?: string | null;
} = {}) {
  apiMock.health.mockResolvedValue({ status: 'ok', env, otaChannel, database: 'ok' });
  servingReleases({ ios: page(ios), android: page(android) });
  apiMock.versionGates.mockResolvedValue(gates);
  await act(async () => {
    render(<ReleasesPage />);
  });
}

const slot = (platform: 'ios' | 'android') => within(screen.getByTestId(`slot-${platform}`));

beforeEach(() => {
  jest.clearAllMocks();
  apiMock.updateRelease.mockResolvedValue({});
  apiMock.setVersionGate.mockResolvedValue({});
  apiMock.rollbackRelease.mockResolvedValue({ rolledBackTo: release({ id: 'r0' }) });
  window.confirm = jest.fn(() => true);
});

/*
 * One deployment, one channel. Each API has its own database holding only its
 * own channel's rows, so a picker offered one real list and one permanently
 * empty one — and once offered "staging", a channel no binary has ever asked
 * for, against which a store build could have been recorded to no effect.
 */
describe('which world this screen is looking at', () => {
  it('says which environment and channel, without asking anyone to choose', async () => {
    await open();
    expect(screen.getByText('staging · development channel')).toBeInTheDocument();
    expect(screen.queryByText('production')).not.toBeInTheDocument();
  });

  it('asks the API rather than guessing at build time', async () => {
    await open();
    expect(apiMock.health).toHaveBeenCalled();
    expect(apiMock.releases).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'development' }),
    );
  });

  it('says what the channel means for who receives it', async () => {
    await open();
    expect(screen.getByText(/TestFlight and Play internal testing/)).toBeInTheDocument();
  });

  it('warns plainly on production, where the audience is shops', async () => {
    await open({ env: 'production', otaChannel: 'production' });
    expect(screen.getByText(/App Store and Play builds/)).toBeInTheDocument();
  });

  it('shows nothing at all when the API names an environment we do not deploy', async () => {
    await open({ env: 'qa', otaChannel: null });
    expect(screen.getByText(/not one of the deployments/)).toBeInTheDocument();
    expect(screen.queryByTestId('slot-ios')).not.toBeInTheDocument();
    // Guessing 'production' here is how a staging screen publishes to shops.
    expect(apiMock.releases).not.toHaveBeenCalled();
  });
});

/*
 * iOS and Android are separate queues with their own live release, history
 * and store. One mixed list meant reading the platform off every row to work
 * out which of two numbers was live on the phone in your hand.
 */
describe('one card per platform', () => {
  it('asks for each platform separately', async () => {
    await open();
    const asked = apiMock.releases.mock.calls.map((c) => c[0].platform);
    expect(asked).toEqual(expect.arrayContaining(['ios', 'android']));
  });

  it('names what is live in the card header', async () => {
    await open({ ios: [release({ sequence: 7, rolloutPercent: 40 })] });
    expect(slot('ios').getByText('Live · OTA 7 · 40%')).toBeInTheDocument();
  });

  it('says so when a platform has nothing live', async () => {
    await open({ ios: [release({ status: 'DRAFT' })] });
    expect(slot('ios').getByText('Nothing live')).toBeInTheDocument();
  });

  it('says a platform has nothing rather than leaving the card blank', async () => {
    await open();
    expect(slot('android').getByText(/Nothing has been published for android/)).toBeInTheDocument();
  });

  it('counts the whole history, not the rows on screen', async () => {
    // The list was capped at a hundred with nothing saying so; a card that
    // shows ten rows has to be able to say there are two hundred behind them.
    apiMock.health.mockResolvedValue({ status: 'ok', env: 'staging', otaChannel: 'development' });
    apiMock.versionGates.mockResolvedValue([gate()]);
    servingReleases({ ios: page([release()], 214), android: page([]) });
    await act(async () => {
      render(<ReleasesPage />);
    });
    expect(slot('ios').getByText('214 releases')).toBeInTheDocument();
  });
});

/*
 * The ladder. Publishing is a staged decision — up a rung, watch, up again —
 * and the control keeps its shape when a draft goes live, which is exactly
 * when somebody is watching it most closely.
 */
describe('walking a rollout up', () => {
  it('publishes a draft at the rung that was pressed', async () => {
    await open({ ios: [release({ status: 'DRAFT', rolloutPercent: 0 })] });
    await act(async () => {
      fireEvent.click(slot('ios').getByTitle('Publish at 20%'));
    });
    expect(apiMock.updateRelease).toHaveBeenCalledWith('r1', {
      status: 'PUBLISHED',
      rolloutPercent: 20,
    });
  });

  it('moves a live release without republishing it', async () => {
    await open({ ios: [release({ status: 'PUBLISHED', rolloutPercent: 20 })] });
    await act(async () => {
      fireEvent.click(slot('ios').getByTitle('Move the rollout to 60%'));
    });
    expect(apiMock.updateRelease).toHaveBeenCalledWith('r1', { rolloutPercent: 60 });
  });

  it('will not re-press the rung it is already on', async () => {
    await open({ ios: [release({ rolloutPercent: 40 })] });
    expect(slot('ios').getByTitle('Already at 40%')).toBeDisabled();
  });

  it('offers no rung below a fifth — zero is Pause, which is a different thing', async () => {
    await open({ ios: [release({ status: 'DRAFT', rolloutPercent: 0 })] });
    expect(slot('ios').queryByTitle('Publish at 5%')).not.toBeInTheDocument();
    expect(slot('ios').queryByTitle('Publish at 0%')).not.toBeInTheDocument();
  });

  it('pauses by serving nobody, without retiring anything', async () => {
    await open({ ios: [release({ rolloutPercent: 40 })] });
    await act(async () => {
      fireEvent.click(slot('ios').getByText('Pause'));
    });
    expect(apiMock.updateRelease).toHaveBeenCalledWith('r1', { rolloutPercent: 0 });
  });

  it('says it is paused rather than showing a Pause that does nothing', async () => {
    await open({ ios: [release({ rolloutPercent: 0 })] });
    expect(slot('ios').getByText('Paused — serving nobody')).toBeInTheDocument();
    expect(slot('ios').queryByText('Pause')).not.toBeInTheDocument();
  });
});

/*
 * expo-updates will not load an update older than the one running, so
 * publishing an older release retires the live one on paper and changes
 * nothing on any phone. The server refuses it; the ladder says so first.
 */
describe('a release older than the one that is live', () => {
  const older = [
    release({ id: 'live', sequence: 9, status: 'PUBLISHED', rolloutPercent: 100 }),
    release({ id: 'old', sequence: 7, status: 'DRAFT', rolloutPercent: 0 }),
  ];

  it('offers no way to publish it at all', async () => {
    await open({ ios: older });
    // Not a greyed-out ladder: four identical dimmed ladders down the page
    // is how the live release ends up scrolled off the top.
    expect(slot('ios').queryByTitle('Publish at 20%')).not.toBeInTheDocument();
    expect(slot('ios').queryByTitle('Publish at 100%')).not.toBeInTheDocument();
  });

  it('can still be retired, which is the one thing left to do with it', async () => {
    await open({ ios: older });
    expect(slot('ios').getAllByText('Archive').length).toBeGreaterThan(0);
  });

  it('says why, rather than looking broken', async () => {
    await open({ ios: older });
    expect(slot('ios').getByText(/OTA 9 is live and newer/)).toBeInTheDocument();
    expect(slot('ios').getByText(/roll that back instead/i)).toBeInTheDocument();
  });

  it('leaves the ladder of the live release itself alone', async () => {
    await open({ ios: older });
    expect(slot('ios').getByTitle('Move the rollout to 20%')).not.toBeDisabled();
  });
});

describe('going back', () => {
  it('asks first, because nobody chose the bundle they land on', async () => {
    await open();
    await act(async () => {
      fireEvent.click(slot('ios').getByText('Roll back'));
    });
    expect(window.confirm).toHaveBeenCalled();
    expect(apiMock.rollbackRelease).toHaveBeenCalledWith('r1');
  });

  it('does nothing when that is declined', async () => {
    window.confirm = jest.fn(() => false);
    await open();
    await act(async () => {
      fireEvent.click(slot('ios').getByText('Roll back'));
    });
    expect(apiMock.rollbackRelease).not.toHaveBeenCalled();
  });

  it('says so when there was nothing to go back to', async () => {
    apiMock.rollbackRelease.mockResolvedValue({ rolledBackTo: null });
    await open();
    await act(async () => {
      fireEvent.click(slot('ios').getByText('Roll back'));
    });
    expect(screen.getByTestId('release-error')).toHaveTextContent(/bundle inside the binary/);
  });

  it('is not offered on a draft, which replaced nothing', async () => {
    await open({ ios: [release({ status: 'DRAFT' })] });
    expect(slot('ios').queryByText('Roll back')).not.toBeInTheDocument();
  });
});

describe('retiring one', () => {
  it('asks first, then archives', async () => {
    await open();
    await act(async () => {
      fireEvent.click(slot('ios').getByText('Archive'));
    });
    expect(apiMock.updateRelease).toHaveBeenCalledWith('r1', { status: 'ARCHIVED' });
  });

  it('is not offered on one that is already archived', async () => {
    await open({ ios: [release({ status: 'ARCHIVED' })] });
    expect(slot('ios').queryByText('Archive')).not.toBeInTheDocument();
  });
});

/*
 * The gate drives the store-update prompt and the blocking update screen. It
 * used to live behind a modal, which hid the numbers you read far more often
 * than you change.
 */
describe('what the stores are serving', () => {
  const gateFor = (platform: 'ios' | 'android') =>
    within(screen.getByTestId(`gate-${platform}`));

  it('shows the build and whether the store has it, without opening anything', async () => {
    await open();
    expect(gateFor('ios').getByText('29828633')).toBeInTheDocument();
    expect(gateFor('ios').getByText('Serving')).toBeInTheDocument();
  });

  it('says plainly when nobody is being forced', async () => {
    await open();
    expect(gateFor('ios').getByText('Not forcing')).toBeInTheDocument();
  });

  it('says so when they are', async () => {
    await open({ gates: [gate({ minSupportedBuild: 29828633 })] });
    expect(gateFor('ios').getByText('Forcing')).toBeInTheDocument();
  });

  it('separates a build that is uploaded from one the store is serving', async () => {
    await open({ gates: [gate({ latestIsLive: false })] });
    expect(gateFor('ios').getByText(/uploaded but the store is not serving it/)).toBeInTheDocument();
  });

  it('will not force while the store is not serving that build', async () => {
    // Locking people out of an app they cannot update is an app that will not
    // open, with no way out but waiting.
    await open({ gates: [gate({ latestIsLive: false })] });
    expect(gateFor('ios').getByText('Force everyone onto it')).toBeDisabled();
  });

  it('raises the minimum to the newest build, and changes nothing else', async () => {
    await open();
    await act(async () => {
      fireEvent.click(gateFor('ios').getByText('Force everyone onto it'));
    });
    expect(apiMock.setVersionGate).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: 'ios',
        channel: 'development',
        latestBuild: 29828633,
        minSupportedBuild: 29828633,
        storeUrl: 'https://apps.apple.com/app/id123',
      }),
    );
  });

  it('lets the forcing be lifted again', async () => {
    await open({ gates: [gate({ minSupportedBuild: 29828633 })] });
    await act(async () => {
      fireEvent.click(gateFor('ios').getByText('Stop forcing'));
    });
    expect(apiMock.setVersionGate).toHaveBeenCalledWith(
      expect.objectContaining({ minSupportedBuild: 0 }),
    );
  });

  it('lets somebody confirm the store went live without touching the floor', async () => {
    await open({ gates: [gate({ latestIsLive: false })] });
    await act(async () => {
      fireEvent.click(gateFor('ios').getByText('It is on the store now'));
    });
    expect(apiMock.setVersionGate).toHaveBeenCalledWith(
      expect.objectContaining({ latestIsLive: true }),
    );
  });

  it('records a build against the channel being looked at', async () => {
    await open({ gates: [] });
    await act(async () => {
      fireEvent.click(within(screen.getByTestId('gate-ios')).getByText('Record a build'));
    });
    await act(async () => {
      fireEvent.change(field('Newest build number'), { target: { value: '42' } });
      fireEvent.change(field('Store link'), { target: { value: 'https://apps.apple.com/x' } });
    });
    await act(async () => {
      fireEvent.click(within(screen.getByTestId('gate-ios')).getByText('Save'));
    });
    expect(apiMock.setVersionGate).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'development', latestBuild: 42 }),
    );
  });

  it('says when a platform has no store build at all', async () => {
    await open({ gates: [] });
    expect(
      within(screen.getByTestId('gate-android')).getByText(/No store build recorded/),
    ).toBeInTheDocument();
  });
});
