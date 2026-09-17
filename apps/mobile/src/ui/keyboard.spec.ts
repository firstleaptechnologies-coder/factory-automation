import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Anything typed into near the bottom of a screen must not sit under the
 * keyboard.
 *
 * It did, everywhere. iOS does not move a scroll view out of the keyboard's
 * way unless asked, and nothing asked: 73 screens use Screen and 39 open forms
 * in a Sheet, and only LoginScreen — which had its own KeyboardAvoidingView —
 * worked. On a shop floor a field you cannot see is a field that gets filled
 * wrong, or not at all.
 *
 * These read the two wrappers rather than render them, because keyboard
 * geometry does not exist in a test renderer: no keyboard appears, no inset is
 * applied, and a test that rendered a field and asserted it was visible would
 * pass just as happily with the fix removed. What can be checked is that the
 * props which produce the behaviour are still there — which is the thing a
 * later edit would quietly drop.
 */
const ui = (name: string) => readFileSync(join(__dirname, name), 'utf8');

describe('a screen that scrolls', () => {
  const screen = ui('Screen.tsx');

  it('insets itself out of the keyboard', () => {
    expect(screen).toMatch(/automaticallyAdjustKeyboardInsets/);
  });

  it('lets a button under a field be pressed on the first tap', () => {
    // Without this the first tap only dismisses the keyboard, so Save takes
    // two and the first one reads as a broken button.
    expect(screen).toMatch(/keyboardShouldPersistTaps="handled"/);
  });

  it('lets a drag put the keyboard away', () => {
    expect(screen).toMatch(/keyboardDismissMode="interactive"/);
  });
});

describe('a screen that does not scroll', () => {
  const screen = ui('Screen.tsx');

  it('is given room instead, since it cannot inset', () => {
    // The punch keypad is the one that matters here.
    expect(screen).toMatch(/KeyboardAvoidingView/);
    expect(screen).toMatch(/testID="screen-fixed"/);
  });

  it('adds that room on iOS only', () => {
    // Android's manifest sets adjustResize, which already shrinks the window;
    // padding on top of it double-counts and leaves a gap above the keyboard.
    expect(screen).toMatch(/Platform\.OS === 'ios' \? 'padding' : undefined/);
  });
});

describe('a sheet', () => {
  const sheet = ui('Sheet.tsx');

  it('rises with the keyboard', () => {
    // A sheet is anchored to the bottom of the screen, which is exactly where
    // the keyboard arrives.
    expect(sheet).toMatch(/KeyboardAvoidingView/);
    expect(sheet).toMatch(/testID="sheet-keyboard"/);
  });

  it('avoids the keyboard on Android too, unlike a screen', () => {
    // A Modal is its own window there, and the manifest's adjustResize does
    // not reach inside it.
    expect(sheet).toMatch(/Platform\.OS === 'ios' \? 'padding' : 'height'/);
  });

  it('still lets its own body scroll clear of the keyboard when it is tall', () => {
    expect(sheet).toMatch(/automaticallyAdjustKeyboardInsets/);
  });

  it('keeps taps working while the keyboard is up', () => {
    expect(sheet).toMatch(/keyboardShouldPersistTaps="handled"/);
  });
});

/*
 * The reason this is one rail rather than 112 screen-level ones: both wrappers
 * are shared, so a screen gets the behaviour by using them. A screen that rolls
 * its own vertical scroller opts out silently, which is what this catches.
 */
describe('no screen quietly opts out', () => {
  const { readdirSync } = require('fs') as typeof import('fs');
  const dir = join(__dirname, '..', 'screens');

  /** Scroller tags that scroll vertically — the only ones a keyboard can cover. */
  function verticalScrollers(source: string): string[] {
    return [...source.matchAll(/<ScrollView\b[^>]*>/g)]
      .map((m) => m[0])
      // A horizontal strip of photo thumbnails has nothing typed into it.
      .filter((tag) => !/\bhorizontal\b/.test(tag));
  }

  const offenders = readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.tsx') && !f.endsWith('.spec.tsx'))
    .filter((f) => {
      const src = readFileSync(join(dir, f), 'utf8');
      return (
        verticalScrollers(src).length > 0 &&
        !/automaticallyAdjustKeyboardInsets/.test(src)
      );
    });

  it('every screen with a vertical scroller of its own handles the keyboard', () => {
    // LoginScreen is allowed: it has its own KeyboardAvoidingView, written
    // before the wrappers did this, and it works.
    const ALLOWED = ['LoginScreen.tsx'];
    expect(offenders.filter((f) => !ALLOWED.includes(f))).toEqual([]);
  });

  it('is actually looking at some screens, so a pass means something', () => {
    const all = readdirSync(dir, { recursive: true, encoding: 'utf8' })
      .filter((f) => f.endsWith('.tsx') && !f.endsWith('.spec.tsx'));
    expect(all.length).toBeGreaterThan(50);
  });

  it('does not count a horizontal strip as something to fix', () => {
    expect(verticalScrollers('<ScrollView horizontal showsHorizontalScrollIndicator={false}>')).toEqual([]);
    expect(verticalScrollers('<ScrollView testID="x">')).toHaveLength(1);
  });
});
