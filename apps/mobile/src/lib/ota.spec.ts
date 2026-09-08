import * as Updates from 'expo-updates';
import { ensureRolloutBucket, runningVersion } from './ota';

const mock = Updates as unknown as {
  isEnabled: boolean;
  manifest: unknown;
  runtimeVersion: string | null;
  getExtraParamsAsync: jest.Mock;
  setExtraParamAsync: jest.Mock;
  __reset: () => void;
};

beforeEach(() => {
  jest.clearAllMocks();
  mock.__reset();
  // clearAllMocks forgets calls but keeps an implementation a previous test
  // set, so the default is restored explicitly.
  mock.getExtraParamsAsync.mockImplementation(async () => ({}));
  mock.isEnabled = true;
  mock.manifest = null;
  mock.runtimeVersion = '1';
});

describe('the rollout bucket', () => {
  it('is set once and then left alone', async () => {
    await ensureRolloutBucket();
    expect(mock.setExtraParamAsync).toHaveBeenCalledTimes(1);

    const [, first] = mock.setExtraParamAsync.mock.calls[0];
    mock.getExtraParamsAsync.mockResolvedValue({ 'rollout-bucket': first });

    await ensureRolloutBucket();
    // A device that re-rolled on every launch would update, un-update and
    // update again as the percentage moved.
    expect(mock.setExtraParamAsync).toHaveBeenCalledTimes(1);
  });

  it('is a number the server can bucket', async () => {
    await ensureRolloutBucket();
    const [key, value] = mock.setExtraParamAsync.mock.calls[0];
    expect(key).toBe('rollout-bucket');
    expect(Number(value)).toBeGreaterThanOrEqual(0);
    expect(Number(value)).toBeLessThan(100);
  });

  it('does nothing where updates are off', async () => {
    mock.isEnabled = false;
    await ensureRolloutBucket();
    expect(mock.setExtraParamAsync).not.toHaveBeenCalled();
  });

  it('never throws, whatever the native side says', async () => {
    mock.getExtraParamsAsync.mockRejectedValue(new Error('no such module'));
    // An older binary, or a development build. The app carries on either way.
    await expect(ensureRolloutBucket()).resolves.toBeUndefined();
  });
});

describe('what is running', () => {
  it('reads the build number the release console stamped', () => {
    mock.manifest = { extra: { otaBuildNumber: 7 } };
    expect(runningVersion()).toEqual({ runtime: '1', ota: 7 });
  });

  it('says there is no update where the binary is running its own bundle', () => {
    expect(runningVersion()).toEqual({ runtime: '1', ota: null });
  });

  it('does not invent a runtime version it was not told', () => {
    mock.runtimeVersion = null;
    expect(runningVersion().runtime).toBe('unknown');
  });
});
