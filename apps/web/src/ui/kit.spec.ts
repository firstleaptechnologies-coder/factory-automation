import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A few rules in the stylesheet carry meaning the components cannot express.
 *
 * jsdom applies no stylesheet, so a rendering test cannot see these — and each
 * one here is a bug that was actually shipped once. Reading the file is a weak
 * check, but it is the difference between a rule that is load-bearing and a
 * rule somebody deletes while tidying.
 */
const css = readFileSync(join(__dirname, 'kit.css'), 'utf8');

/** The body of one rule, so an assertion cannot match a neighbour's. */
function ruleFor(selector: string): string {
  const at = css.indexOf(`${selector} {`);
  expect(at).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf('}', at));
}

describe('a stage count on the home card', () => {
  const rule = () => ruleFor('.stage-count .t-micro');

  it('keeps the stage name on one line', () => {
    // Wrapped over two, "Order confirmed" and "QC & Sanding" pushed the row of
    // counts out of line with each other and the card read as ragged.
    expect(rule()).toContain('white-space: nowrap');
  });

  it('lets the size give way before the line does', () => {
    // Otherwise a long stage name on a narrow window overflows its column.
    expect(rule()).toContain('clamp(');
  });
});

describe('the bar a screen is worked with', () => {
  const rule = () => ruleFor('.sticky-bar');

  it('stays at the top while the rows scroll under it', () => {
    // Scrolling back up to change the search — or to reach the button that
    // moves an enquiry along — is what makes a long screen tiring.
    expect(rule()).toContain('position: sticky');
    expect(rule()).toContain('top: 0');
  });

  it('is painted, so the rows do not show through it', () => {
    expect(rule()).toContain('background:');
  });

  it('sits above the rows it covers', () => {
    expect(rule()).toContain('z-index');
  });
});

describe('the navigation rules', () => {
  it('draws a rule down the left of a category', () => {
    expect(ruleFor('.nav-section')).toContain('border-left');
  });

  it('steps a nested category in from its own', () => {
    expect(ruleFor(".nav-section[data-depth='1']")).toContain('margin-left');
  });

  it('lights the rule of the category you are in', () => {
    expect(ruleFor(".nav-section[data-current='true']")).toContain('var(--accent)');
  });

  it('writes menu labels brightly enough to read at a glance', () => {
    // --text-muted is right for a caption beside something else and too dim
    // for the only words on a dark panel.
    expect(ruleFor('.nav-link')).toContain('var(--text-soft)');
  });
});

describe('a row in a list', () => {
  it('stacks what it holds rather than laying it out side by side', () => {
    // As a row, an order card's two children sat next to each other and
    // nothing spanned the card.
    expect(ruleFor('.card.card-sm.row-card')).toContain('flex-direction: column');
  });
});
