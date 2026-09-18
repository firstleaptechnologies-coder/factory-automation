import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { PlatformReleasesScreen } from './PlatformReleasesScreen';

const mockReleases = jest.fn();
const mockGates = jest.fn();
const mockUpdate = jest.fn();
const mockSetGate = jest.fn();

jest.mock('../../api/client', () => ({
  api: {
    releases: (...a: unknown[]) => mockReleases(...a),
    versionGates: () => mockGates(),
    updateRelease: (...a: unknown[]) => mockUpdate(...a),
    setVersionGate: (...a: unknown[]) => mockSetGate(...a),
  },
}));

let mockPermissions: string[] = [];
jest.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({ can: (p: string) => mockPermissions.includes(p) }),
}));

const release = (over: Record<string, unknown> = {}) => ({
  id: 'rel_1',
  sequence: 12,
  platform: 'ios',
  runtimeVersion: '1.4.0',
  status: 'PUBLISHED',
  kind: 'UPDATE',
  rolloutPercent: 5,
  changelog: 'Faster punching',
  createdAt: '2026-09-08T10:00:00.000Z',
  _count: { assets: 42 },
  ...over,
});

const navigation = { goBack: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockPermissions = ['platform.release.view', 'platform.release.manage'];
  mockReleases.mockResolvedValue([release()]);
  mockGates.mockResolvedValue([]);
  mockUpdate.mockResolvedValue(release());
  mockSetGate.mockResolvedValue({ id: 'g1' });
});

const mount = async () => {
  await render(<PlatformReleasesScreen navigation={navigation as never} />);
  await waitFor(() => expect(mockReleases).toHaveBeenCalled());
};

it('says what is out and how far', async () => {
  await mount();

  expect(await screen.findByText('OTA 12 · ios')).toBeTruthy();
  expect(screen.getByText('5% of installs')).toBeTruthy();
});

it('reads the channel it is asked for', async () => {
  await mount();
  // development, not "staging": the environment is staging, the channel it
  // serves is development, and only a channel a binary carries exists here.
  await fireEvent.press(screen.getByText('development'));

  await waitFor(() => expect(mockReleases).toHaveBeenLastCalledWith({ channel: 'development' }));
});

it('publishes a draft to a few people first', async () => {
  mockReleases.mockResolvedValue([release({ status: 'DRAFT', rolloutPercent: 0 })]);
  await mount();
  await fireEvent.press(await screen.findByText('Publish to 5%'));

  await waitFor(() =>
    expect(mockUpdate).toHaveBeenCalledWith('rel_1', { status: 'PUBLISHED', rolloutPercent: 5 }),
  );
});

it('walks a rollout up', async () => {
  await mount();
  await fireEvent.press(await screen.findByText('25%'));

  await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('rel_1', { rolloutPercent: 25 }));
});

/*
 * The reason this screen is worth having on a phone at all: a rollout going
 * wrong is something you find out about away from a desk, and walking it back
 * to nobody should not need one.
 */
it('walks a rollout back down to nobody', async () => {
  await mount();
  await fireEvent.press(await screen.findByText('0%'));

  await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('rel_1', { rolloutPercent: 0 }));
});

it('retires one', async () => {
  await mount();
  await fireEvent.press(await screen.findByText('Retire'));

  await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('rel_1', { status: 'ARCHIVED' }));
});

it('says so when a channel has nothing on it', async () => {
  mockReleases.mockResolvedValue([]);
  await mount();

  expect(await screen.findByText('Nothing published on this channel')).toBeTruthy();
});

describe('forcing everyone onto the newest build', () => {
  /*
   * The confirmation is a native Alert, which never appears in a test
   * renderer. Spying on it is what lets the destructive button be pressed —
   * and the point of the test is what happens after that press, not the
   * dialog.
   */
  beforeEach(() => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  const forcedGate = (over: Record<string, unknown> = {}) => ({
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
    mockGates.mockResolvedValue([forcedGate()]);
    await mount();
    expect(await screen.findByText('not forcing')).toBeTruthy();
  });

  it('says so when they are', async () => {
    mockGates.mockResolvedValue([forcedGate({ minSupportedBuild: 29827684 })]);
    await mount();
    expect(await screen.findByText('forcing')).toBeTruthy();
  });

  /*
   * Forcing people onto a build the store is not serving yet is an app that
   * will not open, with no way out but waiting and nothing to say why.
   */
  it('explains why it will not force while the store is not serving it', async () => {
    mockGates.mockResolvedValue([forcedGate({ latestIsLive: false })]);
    await mount();
    expect(
      await screen.findByText(/that would be an app nobody can open/),
    ).toBeTruthy();
  });

  it('is not offered once everyone is already on it', async () => {
    mockGates.mockResolvedValue([forcedGate({ minSupportedBuild: 29827684 })]);
    await mount();
    expect(screen.queryByText(/Force every install below/)).toBeNull();
  });

  it('raises the minimum to the newest build when confirmed', async () => {
    mockGates.mockResolvedValue([forcedGate()]);
    await mount();
    await fireEvent.press(await screen.findByText(/Force every install below 29827684/));
    // The confirmation's destructive button.
    const alert = (jest.mocked(Alert.alert).mock.calls.at(-1) ?? []) as unknown[];
    const buttons = alert[2] as { text: string; onPress?: () => void }[];
    buttons.find((b) => b.text === 'Force update')?.onPress?.();

    await waitFor(() =>
      expect(mockSetGate).toHaveBeenCalledWith(
        expect.objectContaining({ minSupportedBuild: 29827684, latestBuild: 29827684 }),
      ),
    );
    // Whether the store is serving it is a separate fact, not this button's.
    expect(mockSetGate.mock.calls[0][0]).not.toHaveProperty('latestIsLive');
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
    await mount();
    // Both platforms, both empty. Telling the app nothing is correct until a
    // build exists.
    expect(await screen.findAllByText(/Nothing recorded/)).toHaveLength(2);
  });

  it('shows the build that is recorded', async () => {
    mockGates.mockResolvedValue([gate()]);
    await mount();

    expect(await screen.findByText(/Build 29827484/)).toBeTruthy();
    expect(screen.getByText('live on the store')).toBeTruthy();
  });

  it('separates a build that is uploaded from one the store is serving', async () => {
    mockGates.mockResolvedValue([gate({ latestIsLive: false })]);
    await mount();

    expect(await screen.findByText('uploaded, not live')).toBeTruthy();
    // The reason matters more than the badge.
    expect(screen.getByText(/Nobody is being offered this yet/)).toBeTruthy();
  });

  it('lets somebody confirm the store went live without touching the floor', async () => {
    mockGates.mockResolvedValue([gate({ latestIsLive: false })]);
    await mount();
    await fireEvent.press(await screen.findByText('It is live now'));

    await waitFor(() =>
      expect(mockSetGate).toHaveBeenCalledWith(
        expect.objectContaining({ platform: 'ios', channel: 'production', latestIsLive: true }),
      ),
    );
    // Raising the floor is a separate, deliberate act, not a side effect.
    expect(mockSetGate.mock.calls[0][0]).not.toHaveProperty('minSupportedBuild');
  });

  it('records a build against the channel being looked at', async () => {
    await mount();
    await fireEvent.press((await screen.findAllByText('Record a build'))[0]);
    await fireEvent.changeText(await screen.findByPlaceholderText('29827484'), '29827999');
    await fireEvent.changeText(
      screen.getByPlaceholderText('https://apps.apple.com/app/id…'),
      'https://apps.apple.com/app/id1',
    );
    await fireEvent.press(screen.getByText('Save'));

    await waitFor(() =>
      expect(mockSetGate).toHaveBeenCalledWith(
        expect.objectContaining({
          platform: 'ios',
          channel: 'production',
          latestBuild: 29827999,
          storeUrl: 'https://apps.apple.com/app/id1',
        }),
      ),
    );
  });
});

/*
 * There is one app in the stores for every workspace, so shipping belongs to
 * whoever owns the product. Somebody who may only look must not be able to put
 * a build in front of anybody.
 */
it('offers nothing but looking to somebody who may not ship', async () => {
  mockPermissions = ['platform.release.view'];
  await mount();
  await screen.findByText('OTA 12 · ios');

  expect(screen.queryByText('25%')).toBeNull();
  expect(screen.queryByText('Retire')).toBeNull();
  expect(screen.queryByText('Set the version floor')).toBeNull();
});
