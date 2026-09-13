import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The older pages style plain markup — a bare `<input>`, a bare `<label>` —
 * and the kit's components bring their own. Where one lands inside the other,
 * the page's rules win on specificity and quietly take a component apart.
 *
 * jsdom applies no stylesheet, so no rendering test can see any of this. Each
 * assertion here is a bug that was actually shipped once.
 */
const css = readFileSync(join(__dirname, 'pages.css'), 'utf8');

/** The body of one rule, so an assertion cannot match a neighbour's. */
function ruleFor(selector: string): string {
  const at = css.indexOf(`${selector} {`);
  expect(at).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf('}', at));
}

describe('a kit field on a page written in plain markup', () => {
  /*
   * `Field` is a `<label class="field">` wrapping a well. The bare-label rule
   * gives every `<label>` one clipped line, which flattened the whole field to
   * 15px: the client picker's name and phone drew on the punch screen as two
   * captions with nothing underneath them, and the order could not be typed.
   */
  const rule = () => ruleFor('.legacy label.field,\n.modal label.field');

  it('is let out of the one-line caption height', () => {
    expect(rule()).toContain('height: auto');
    expect(rule()).toContain('overflow: visible');
  });

  it('stacks its label above its well', () => {
    expect(rule()).toContain('flex-direction: column');
  });

  it('is undone before the rule that breaks it, where it can be read', () => {
    // A reader who meets `.legacy label` first has no reason to look further.
    expect(css.indexOf('.legacy label.field')).toBeLessThan(
      css.indexOf('.legacy label,\n.modal label'),
    );
  });
});

describe('the input inside a kit well', () => {
  const rule = () =>
    ruleFor(
      ".legacy .field-well input:not([type='checkbox']):not([type='radio']):not([type='file']),\n" +
        '.legacy .field-well textarea,\n' +
        ".modal .field-well input:not([type='checkbox']):not([type='radio']):not([type='file']),\n" +
        '.modal .field-well textarea',
    );

  it('draws no second sunken shape of its own', () => {
    // The well is the field. An input carrying its own inset inside it reads
    // as a box in a box.
    expect(rule()).toContain('background: transparent');
    expect(rule()).toContain('box-shadow: none');
  });

  /*
   * It has to out-specify `.legacy input:not(…):not(…):not(…)`, which counts
   * four classes to this one's five. Dropping a `:not()` while tidying takes
   * the count to four, the later rule in the file wins, and the double inset
   * is back with nothing failing.
   */
  it('repeats the type exclusions it needs to win on specificity', () => {
    const line = css
      .split('\n')
      .find((one) => one.startsWith('.legacy .field-well input'))!;

    expect(line.match(/:not\(/g)).toHaveLength(3);
  });
});

describe('the client picker trigger', () => {
  it('is exempt from the bare-button pad the older pages apply', () => {
    // Otherwise it is a raised pill where every other client field is a well,
    // and the one control that must look the same everywhere does not.
    const selector = css.slice(css.indexOf('.legacy button:not('), css.indexOf('{', css.indexOf('.legacy button:not(')));
    expect(selector).toContain(':not(.picker-trigger)');
  });

  it('is drawn as the sunken well the field beside it is', () => {
    expect(ruleFor('.picker-trigger')).toContain('var(--grad-inset)');
    expect(ruleFor('.picker-trigger')).toContain('min-height: 50px');
  });
});
