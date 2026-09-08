import { Alert, AlertButton } from 'react-native';

/**
 * A question with a place to type the answer, where the platform has one.
 *
 * `Alert.prompt` is iOS only. Reaching for it as `Alert.prompt?.(…) ?? Alert.alert(…)`
 * reads like a fallback but is not one: prompt returns undefined, so the alert
 * fired every time as well and two dialogs came up stacked on top of each other.
 * Whether the platform can take typed input is a question about the platform,
 * so it is asked about the function itself.
 *
 * On Android the same buttons are offered without the field, and the handler is
 * called with nothing — every caller must therefore treat the text as optional.
 */
export function ask(
  title: string,
  message: string,
  buttons: (AlertButton & { onPress?: (text?: string) => void })[],
): void {
  if (typeof Alert.prompt === 'function') {
    Alert.prompt(title, message, buttons as AlertButton[], 'plain-text');
    return;
  }
  Alert.alert(title, message, buttons as AlertButton[]);
}
