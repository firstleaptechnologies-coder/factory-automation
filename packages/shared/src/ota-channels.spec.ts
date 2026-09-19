import { readFileSync } from 'fs';
import { join } from 'path';
import { DEFAULT_OTA_CHANNEL, OTA_CHANNELS, channelForAppEnv } from './types';

/**
 * The channel names are written down twice — here, for the screens that let
 * somebody publish, and in deploy/environments.json, which is what provisions
 * the servers and configures the binaries.
 *
 * They drifted once already, silently. Both release screens offered
 * "production" and "staging", while every binary carries "development" or
 * "production" — so the staging tab showed a channel nothing publishes to, and
 * recording a store build under it would have written a version gate that no
 * app ever asks for. Nothing failed; it just quietly did nothing.
 */
const environments = JSON.parse(
  readFileSync(join(__dirname, '..', '..', '..', 'deploy', 'environments.json'), 'utf8'),
) as Record<string, { otaChannel?: string }>;

const deployed = Object.entries(environments)
  .filter(([key]) => !key.startsWith('_'))
  .map(([, environment]) => environment.otaChannel!);

describe('the channels the screens offer', () => {
  it('are the channels the deployments actually serve', () => {
    expect([...OTA_CHANNELS].sort()).toEqual([...deployed].sort());
  });

  it('include none that no binary would ask about', () => {
    for (const channel of OTA_CHANNELS) {
      expect(deployed).toContain(channel);
    }
  });

  it('leave none of the real ones out', () => {
    for (const channel of deployed) {
      expect(OTA_CHANNELS).toContain(channel);
    }
  });

  /*
   * The environment is staging; the channel it serves is development. Naming
   * the channel after the environment is the specific mistake this file
   * exists to prevent from coming back.
   */
  it('do not name a channel after the environment that serves it', () => {
    expect(OTA_CHANNELS).not.toContain('staging' as never);
  });

  /*
   * The screen answers "what are shops running", so it opens on production.
   * Opening on development would show an empty list most days and bury the
   * one that matters.
   */
  it('open on a channel that exists', () => {
    expect(OTA_CHANNELS).toContain(DEFAULT_OTA_CHANNEL);
  });

  it('open on production, not on whichever happens to be first', () => {
    expect(DEFAULT_OTA_CHANNEL).toBe('production');
  });
});

/*
 * Which channel each deployment manages.
 *
 * The release screen locks itself to one channel — the one this deployment's
 * database actually holds — rather than offering a picker over channels it
 * cannot serve. That lock is only as good as this mapping, and the mapping is
 * exactly the place the environment/channel confusion would return: `staging`
 * is an environment, `development` is the channel it serves.
 */
describe('the channel a deployment manages', () => {
  const byAppEnv = Object.entries(environments)
    .filter(([key]) => !key.startsWith('_'))
    .map(([, environment]) => environment as { appEnv?: string; otaChannel?: string });

  it('matches what deploy/environments.json says each environment serves', () => {
    for (const environment of byAppEnv) {
      expect(channelForAppEnv(environment.appEnv)).toBe(environment.otaChannel);
    }
  });

  it('covers every environment we deploy, so none falls back to a guess', () => {
    for (const environment of byAppEnv) {
      expect(channelForAppEnv(environment.appEnv)).not.toBeNull();
    }
  });

  /*
   * A developer running the API locally has APP_ENV=development and is
   * publishing to the development channel, same as staging.
   */
  it('puts a local API on the same channel as staging, not on production', () => {
    expect(channelForAppEnv('development')).toBe('development');
  });

  it('refuses to guess for an environment it does not know', () => {
    // Guessing 'production' here is how a screen nobody checked starts
    // publishing to shops.
    expect(channelForAppEnv('qa')).toBeNull();
    expect(channelForAppEnv('')).toBeNull();
    expect(channelForAppEnv(null)).toBeNull();
    expect(channelForAppEnv(undefined)).toBeNull();
  });
});
