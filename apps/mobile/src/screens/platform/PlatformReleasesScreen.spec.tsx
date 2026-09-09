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
  await fireEvent.press(screen.getByText('staging'));

  await waitFor(() => expect(mockReleases).toHaveBeenLastCalledWith({ channel: 'staging' }));
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

describe('the version floor', () => {
  it('says plainly when there is none', async () => {
    await mount();

    expect(await screen.findByText(/No floor set/)).toBeTruthy();
  });

  it('shows one that is set', async () => {
    mockGates.mockResolvedValue([
      { id: 'g1', platform: 'ios', channel: 'production', minimumVersion: '1.2.0', recommendedVersion: '1.4.0' },
    ]);
    await mount();

    expect(await screen.findByText(/must be 1.2.0/)).toBeTruthy();
  });

  it('sets one for the channel being looked at', async () => {
    await mount();
    await fireEvent.press(await screen.findByText('Set the version floor'));
    await fireEvent.changeText(await screen.findByPlaceholderText('1.2.0'), '1.5.0');
    await fireEvent.press(screen.getByText('Set the floor'));

    await waitFor(() =>
      expect(mockSetGate).toHaveBeenCalledWith({
        platform: 'ios',
        channel: 'production',
        minimumVersion: '1.5.0',
        recommendedVersion: undefined,
        message: undefined,
      }),
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
