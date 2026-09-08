import { fillLetter, placeholdersIn, unknownPlaceholders } from './letters';

describe('filling a letter in', () => {
  it('puts the values where the placeholders were', () => {
    expect(
      fillLetter('Dear {{name}}, you join as {{designation}}.', {
        name: 'Ramesh Kumar',
        designation: 'CNC operator',
      }),
    ).toBe('Dear Ramesh Kumar, you join as CNC operator.');
  });

  it('copes with spacing inside the braces', () => {
    expect(fillLetter('Dear {{ name }},', { name: 'Ramesh' })).toBe('Dear Ramesh,');
  });

  it('fills the same placeholder everywhere it appears', () => {
    expect(fillLetter('{{name}} — {{name}}', { name: 'Ramesh' })).toBe('Ramesh — Ramesh');
  });

  it('leaves a placeholder nobody has a value for standing', () => {
    /*
     * `{{salary}}` staring back from a draft is a question somebody can answer.
     * An empty space in the middle of a sentence is a letter that goes out
     * saying nothing about the pay, and nobody notices until it has.
     */
    expect(fillLetter('You will be paid {{salary}} a month.', {})).toBe(
      'You will be paid {{salary}} a month.',
    );
    expect(fillLetter('Paid {{salary}}.', { salary: '' })).toBe('Paid {{salary}}.');
  });

  it('leaves text with no placeholders alone', () => {
    expect(fillLetter('Plain words.', { name: 'Ramesh' })).toBe('Plain words.');
  });
});

describe('what a template asks for', () => {
  it('lists the placeholders in the order they first appear', () => {
    expect(placeholdersIn('{{name}} of {{firmName}}, {{name}} again')).toEqual([
      'name',
      'firmName',
    ]);
  });

  it('names the ones nothing will ever fill in', () => {
    // A template asking for {{bonus}} would print those braces on a letter
    // somebody hands to a bank.
    expect(unknownPlaceholders('{{name}} gets {{bonus}}')).toEqual(['bonus']);
    expect(unknownPlaceholders('{{name}} joined {{joinedOn}}')).toEqual([]);
  });
});
