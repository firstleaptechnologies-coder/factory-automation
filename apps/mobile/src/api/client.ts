import {Platform} from 'react-native';
import {ApiClient} from '@decor/shared';

/**
 * Android emulators reach the host machine on 10.0.2.2, not localhost. On a real
 * device this must point at the office LAN address of the API box — set it in
 * one place here rather than hunting through screens later.
 */
const DEV_HOST = Platform.select({
  android: 'http://10.0.2.2:3001',
  default: 'http://localhost:3001',
});

export const API_BASE_URL = `${DEV_HOST}/api`;

let onUnauthorized: (() => void) | undefined;

export const api = new ApiClient({
  baseUrl: API_BASE_URL,
  onUnauthorized: () => onUnauthorized?.(),
});

export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}
