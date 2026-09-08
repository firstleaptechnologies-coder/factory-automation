import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';

/**
 * What is on the clipboard, if it looks like it belongs in this field.
 *
 * People fill this app from WhatsApp — a client's number, a GST number, an
 * address someone sent over. Retyping it is where mistakes come from, and the
 * system paste menu needs a long-press most users on a shop floor never find.
 * So the field offers what was copied, once, as a visible button.
 *
 * The clipboard is read when a field is focused and when the app comes back to
 * the foreground — the two moments the user is looking at it — and never in the
 * background.
 */
export function useClipboardSuggestion(
  accepts?: (text: string) => boolean,
): { suggestion: string | null; consume: () => string | null; check: () => void } {
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  const check = useCallback(async () => {
    try {
      const text = (await Clipboard.getString())?.trim();
      if (!text) return setSuggestion(null);
      // A clipboard holding a whole paragraph is almost never meant for one
      // input, and the button would cover the field.
      if (text.length > 200) return setSuggestion(null);
      if (text === dismissed) return setSuggestion(null);
      if (accepts && !accepts(text)) return setSuggestion(null);
      setSuggestion(text);
    } catch {
      // A device that refuses clipboard access simply gets no button.
      setSuggestion(null);
    }
  }, [accepts, dismissed]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    return () => subscription.remove();
  }, [check]);

  return {
    suggestion,
    check: () => void check(),
    consume: () => {
      const value = suggestion;
      // Offered once. Left standing it would nag over a field the user has
      // deliberately typed something else into.
      setDismissed(value);
      setSuggestion(null);
      return value;
    },
  };
}

/** Looks like a phone number someone would ring. */
export function looksLikePhone(text: string): boolean {
  const digits = text.replace(/[^\d]/g, '');
  return digits.length >= 10 && digits.length <= 13 && /^[\d+\-()\s]+$/.test(text);
}

/** Looks like a 15-character GSTIN. */
export function looksLikeGstin(text: string): boolean {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z][Z][0-9A-Z]$/i.test(text.replace(/\s/g, ''));
}

/** Long enough and varied enough to be an address rather than a stray word. */
export function looksLikeAddress(text: string): boolean {
  return text.length >= 12 && /\s/.test(text);
}
