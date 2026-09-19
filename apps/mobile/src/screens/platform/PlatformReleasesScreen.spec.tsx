import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { PlatformReleasesScreen } from './PlatformReleasesScreen';

const mockHealth = jest.fn();
const mockReleases = jest.fn();
const mockGates = jest.fn();
const mockUpdate = jest.fn();
const mockRollback = jest.fn();
const mockSetGate = jest.fn();

jest.mock('../../api/client', () => ({
  api: {
    health: (...a: unknown[]) => mockHealth(...a),
    releases: (...a: unknown[]) => mockReleases(...a),
    versionGates: (...a: unknown[]) => mockGates(...a),
    updateRelease: (...a: unknown[]) => mockUpdate(...a),
    rollbackRelease: (...a: unknown[]) => mockRollback(...a),
    setVersionGate: (...a: unknown[]) => mockSetGate(...a),
  },
}));

let mockPermissions: string[] = [];
jest.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({ can: (p: string) => mockPermissions.includes(p) }),
}));

const release = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  channel: 'development',
  runtimeVersion: '1',
  platform: 'ios',
  kind: 'UPDATE',
  status: 'PUBLISHED',
  rolloutPercent: 20,
  sequence: 12,
  changelog: 'Fix the punch screen',
  createdAt: '2026-09-08T10:00:00.000Z',
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

const navigation = { goBack: jest.fn() };

async function mount({
  ios = [release()],
  android = [] as unknown[],
  gates = [gate()] as unknown[],
  env = 'staging',
  otaChannel = 'development' as string | null,
}: Record<string, unknown> = {} as never) {
  mockHealth.mockResolvedValue({ status: 'ok', env, otaChannel });
  mockReleases.mockImplementation(async ({ platform }: { platform: string }) =>
    platform === 'ios' ? page(ios as unknown[]) : page(android as unknown[]),
  );
  mockGates.mockResolvedValue(gates);
  await render(<PlatformReleasesScreen navigation={navigation as never} />);
  await waitFor(() => expect(mockHealth).toHaveBeenCalled());
}

const slot = (platform: 'ios' | 'android') => within(screen.getByTestId(`slot-${platform}`));

beforeEach(() => {
  jest.clearAllMocks();
  mockPermissions = ['platform.release.view', 'platform.release.manage'];
  mockUpdate.mockResolvedValue(release());
  mockSetGate.mockResolvedValue({ id: 'g1' });
  mockRollback.mockResolvedValue({ rolledBackTo: release({ id: 'r0' }) });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

/*
 * One deployment, one channel. Each API has its own database holding only its
 * own channel's rows, so a picker offered one real list and one permanently
 * empty one — and once offered "staging", which no binary has ever asked for.
 */
describe('which world this screen is looking at', () => {
  it('names the environment and channel instead of asking anyone to choose', async () => {
    await mount();
    expect(await screen.findByText('staging · development')).toBeTruthy();
    expect(screen.queryByText('production')).toBeNull();
  });

  it('asks the API rather than carrying a guess in the binary', async () => {
    await mount();
    await waitFor(() =>
      expect(mockReleases).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'development', platform: 'ios' }),
      ),
    );
  });

  it('shows nothing when the API names an environment we do not deploy', async () => {
    await mount({ env: 'qa', otaChannel: null });
    expect(await screen.findByText('Cannot tell which world this is')).toBeTruthy();
    expect(screen.queryByTestId('slot-ios')).toBeNull();
    // Guessing 'production' is how a staging screen publishes to shops.
    expect(mockReleases).not.toHaveBeenCalled();
  });
});

describe('one section per platform', () => {
  it('asks for each platform separately', async () => {
    await mount();
    await waitFor(() => expect(mockReleases).toHaveBeenCalledTimes(2));
    const asked = mockReleases.mock.calls.map((c) => c[0].platform);
    expect(asked).toEqual(expect.arrayContaining(['ios', 'android']));
  });

  it('names what is live', async () => {
    await mount({ ios: [release({ sequence: 12, rolloutPercent: 40 })] });
    expect(await slot('ios').findByText('Live · OTA 12 · 40%')).toBeTruthy();
  });

  it('says when a platform has nothing live', async () => {
    await mount({ ios: [release({ status: 'DRAFT' })] });
    expect(await slot('ios').findByText('Nothing live')).toBeTruthy();
  });

  it('says a platform is empty rather than leaving the section blank', async () => {
    await mount();
    expect(await slot('android').findByText(/Nothing published for android/)).toBeTruthy();
  });

  it('says how many there are, not how many are on screen', async () => {
    mockHealth.mockResolvedValue({ status: 'ok', env: 'staging', otaChannel: 'development' });
    mockGates.mockResolvedValue([gate()]);
    mockReleases.mockImplementation(async ({ platform }: { platform: string }) =>
      platform === 'ios' ? page([release()], 214) : page([]),
    );
    await render(<PlatformReleasesScreen navigation={navigation as never} />);
    expect(await screen.findByText(/214/)).toBeTruthy();
  });
});

/*
 * Publishing is a staged decision — up a rung, watch, up again — and the
 * control keeps its shape when a draft goes live, which is exactly when
 * somebody is watching it most closely.
 */
describe('walking a rollout up', () => {
  it('publishes a draft at the rung that was pressed', async () => {
    await mount({ ios: [release({ status: 'DRAFT', rolloutPercent: 0 })] });
    await fireEvent.press(await screen.findByTestId('rung-r1-20'));
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith('r1', {
        status: 'PUBLISHED',
        rolloutPercent: 20,
      }),
    );
  });

  it('moves a live release without republishing it', async () => {
    await mount({ ios: [release({ status: 'PUBLISHED', rolloutPercent: 20 })] });
    await fireEvent.press(await screen.findByTestId('rung-r1-60'));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('r1', { rolloutPercent: 60 }));
  });

  it('will not re-press the rung it is already on', async () => {
    await mount({ ios: [release({ rolloutPercent: 40 })] });
    await fireEvent.press(await screen.findByTestId('rung-r1-40'));
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('offers no rung below a fifth — zero is Pause, a different intention', async () => {
    await mount({ ios: [release({ status: 'DRAFT', rolloutPercent: 0 })] });
    await screen.findByTestId('rung-r1-20');
    expect(screen.queryByTestId('rung-r1-5')).toBeNull();
    expect(screen.queryByTestId('rung-r1-0')).toBeNull();
  });

  it('pauses by serving nobody, without retiring anything', async () => {
    await mount({ ios: [release({ rolloutPercent: 40 })] });
    await fireEvent.press(await screen.findByTestId('pause-r1'));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('r1', { rolloutPercent: 0 }));
  });

  it('says it is paused rather than offering a Pause that does nothing', async () => {
    await mount({ ios: [release({ rolloutPercent: 0 })] });
    expect(await screen.findByText('Paused — serving nobody')).toBeTruthy();
    expect(screen.queryByTestId('pause-r1')).toBeNull();
  });

  it('offers nothing but looking to somebody who may not ship', async () => {
    mockPermissions = ['platform.release.view'];
    await mount();
    await slot('ios').findByText('Live · OTA 12 · 20%');
    expect(screen.queryByTestId('rung-r1-20')).toBeNull();
  });
});

/*
 * expo-updates will not load an update older than the one running, so
 * publishing an older release retires the live one on paper and changes
 * nothing on any phone. The server refuses it; the ladder says so first.
 */
describe('a release older than the one that is live', () => {
  const older = [
    release({ id: 'live', sequence: 14, status: 'PUBLISHED', rolloutPercent: 100 }),
    release({ id: 'old', sequence: 12, status: 'DRAFT', rolloutPercent: 0 }),
  ];

  it('offers no way to publish it at all', async () => {
    await mount({ ios: older });
    await screen.findByTestId('rung-live-20');
    // Not a dimmed ladder: the same paragraph four times down the screen is
    // how the one release that matters ends up scrolled off the top.
    expect(screen.queryByTestId('rung-old-20')).toBeNull();
    expect(screen.queryByTestId('rung-old-100')).toBeNull();
  });

  it('can still be retired, which is the one thing left to do with it', async () => {
    await mount({ ios: older });
    expect(await screen.findByTestId('archive-old')).toBeTruthy();
  });

  it('says why, rather than looking broken', async () => {
    await mount({ ios: older });
    expect(await screen.findByText(/OTA 14 is live and newer/)).toBeTruthy();
  });

  it('leaves the ladder of the live release itself alone', async () => {
    await mount({ ios: older });
    await fireEvent.press(await screen.findByTestId('rung-live-20'));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('live', { rolloutPercent: 20 }));
  });
});

describe('going back', () => {
  const tapAndConfirm = async (testID: string, action: string) => {
    await fireEvent.press(await screen.findByTestId(testID));
    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
    await buttons.find((b: { text: string }) => b.text === action).onPress();
  };

  it('asks first, because nobody chose the bundle they land on', async () => {
    await mount();
    await fireEvent.press(await screen.findByTestId('rollback-r1'));
    expect(Alert.alert).toHaveBeenCalled();
    expect(mockRollback).not.toHaveBeenCalled();
  });

  it('rolls back once that is confirmed', async () => {
    await mount();
    await tapAndConfirm('rollback-r1', 'Roll back');
    await waitFor(() => expect(mockRollback).toHaveBeenCalledWith('r1'));
  });

  it('says so when there was nothing to go back to', async () => {
    mockRollback.mockResolvedValue({ rolledBackTo: null });
    await mount();
    await tapAndConfirm('rollback-r1', 'Roll back');
    expect(await screen.findByText(/bundle inside the binary/)).toBeTruthy();
  });

  it('is not offered on a draft, which replaced nothing', async () => {
    await mount({ ios: [release({ status: 'DRAFT' })] });
    await screen.findByTestId('rung-r1-20');
    expect(screen.queryByTestId('rollback-r1')).toBeNull();
  });

  it('archives on confirmation, and not before', async () => {
    await mount();
    await tapAndConfirm('archive-r1', 'Archive');
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('r1', { status: 'ARCHIVED' }));
  });
});

describe('what the stores are serving', () => {
  const gateFor = (platform: 'ios' | 'android') =>
    within(screen.getByTestId(`gate-${platform}`));

  it('shows the build and whether the store has it', async () => {
    await mount();
    expect(await gateFor('ios').findByText(/Build 29828633/)).toBeTruthy();
    expect(gateFor('ios').getByText(/on the store/)).toBeTruthy();
  });

  it('says plainly when nobody is being forced', async () => {
    await mount();
    expect(await gateFor('ios').findByText('Not forcing')).toBeTruthy();
  });

  it('says so when they are', async () => {
    await mount({ gates: [gate({ minSupportedBuild: 29828633 })] });
    expect(await gateFor('ios').findByText('Forcing')).toBeTruthy();
  });

  it('separates a build that is uploaded from one the store is serving', async () => {
    await mount({ gates: [gate({ latestIsLive: false })] });
    expect(await gateFor('ios').findByText(/store not serving it yet/)).toBeTruthy();
  });

  it('will not force while the store is not serving that build', async () => {
    // Locking people out of an app they cannot update is an app that will not
    // open, with no way out but waiting.
    await mount({ gates: [gate({ latestIsLive: false })] });
    const button = await gateFor('ios').findByText(/Force every install below/);
    await fireEvent.press(button);
    expect(mockSetGate).not.toHaveBeenCalled();
  });

  it('raises the minimum to the newest build, and changes nothing else', async () => {
    await mount();
    await fireEvent.press(await gateFor('ios').findByText(/Force every install below/));
    await waitFor(() =>
      expect(mockSetGate).toHaveBeenCalledWith(
        expect.objectContaining({
          platform: 'ios',
          channel: 'development',
          latestBuild: 29828633,
          minSupportedBuild: 29828633,
          storeUrl: 'https://apps.apple.com/app/id123',
        }),
      ),
    );
  });

  it('lets the forcing be lifted again', async () => {
    await mount({ gates: [gate({ minSupportedBuild: 29828633 })] });
    await fireEvent.press(await gateFor('ios').findByText('Stop forcing'));
    await waitFor(() =>
      expect(mockSetGate).toHaveBeenCalledWith(expect.objectContaining({ minSupportedBuild: 0 })),
    );
  });

  it('lets somebody confirm the store went live without touching the floor', async () => {
    await mount({ gates: [gate({ latestIsLive: false })] });
    await fireEvent.press(await gateFor('ios').findByText('It is on the store now'));
    await waitFor(() =>
      expect(mockSetGate).toHaveBeenCalledWith(expect.objectContaining({ latestIsLive: true })),
    );
  });

  it('says when a platform has no store build at all', async () => {
    await mount({ gates: [] });
    expect(await gateFor('android').findByText(/No store build recorded/)).toBeTruthy();
  });
});
