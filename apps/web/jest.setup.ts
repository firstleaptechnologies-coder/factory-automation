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
