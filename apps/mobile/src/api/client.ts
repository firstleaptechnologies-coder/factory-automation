import {Platform} from 'react-native';
import * as Updates from 'expo-updates';
import {ApiClient} from '@fas/shared';
import {DEFAULT_CHANNEL, originFor} from './environments';

/**
 * The channel this binary was built on, which names the deployment it belongs
 * to. Null in a Metro build, where updates are off — that is development.
 */
export const CHANNEL = Updates.channel ?? DEFAULT_CHANNEL;

const origin = originFor(CHANNEL, Platform.OS === 'android' ? 'android' : 'ios');

/**
 * A build whose channel has no server cannot reach one, and saying so here is
 * better than every screen failing separately with a network error. It cannot
 * happen through an update — the channel is native — and `environments.spec.ts`
 * refuses to let such a binary be built in the first place.
 */
export const API_BASE_URL = origin
  ? `${origin}/api`
  : `unconfigured://${CHANNEL}`;

let onUnauthorized: (() => void) | undefined;

export const api = new ApiClient({
  baseUrl: API_BASE_URL,
  onUnauthorized: () => onUnauthorized?.(),
});

export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}
