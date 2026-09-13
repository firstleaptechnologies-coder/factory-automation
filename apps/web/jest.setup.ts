import '@testing-library/jest-dom';

/**
 * jsdom has no layout and therefore no scrolling. The wheel picker scrolls
 * itself, so a stand-in is installed that simply moves scrollTop — enough for
 * the component's own logic to be exercised.
 */
Element.prototype.scrollTo = function scrollTo(
  this: Element,
  options?: number | ScrollToOptions,
) {
  const top = typeof options === 'number' ? options : (options?.top ?? 0);
  Object.defineProperty(this, 'scrollTop', { value: top, writable: true, configurable: true });
} as never;

/*
 * jsdom keeps one `localStorage` for a whole file, so a preference written by
 * one test is still there for the next — which is how a screen that remembers
 * the display unit made a later test read sizes in the unit an earlier one had
 * clicked. Preferences that persist are the point; leaking between tests is
 * not.
 */
beforeEach(() => {
  try {
    window.localStorage.clear();
    window.sessionStorage.clear();
  } catch {
    // A test that has deliberately broken storage clears nothing, and that is
    // the state it wanted.
  }
});
