import {
  NOTIFICATION_KEYS,
  NOTIFICATION_TEMPLATES,
  renderNotification,
  templateFor,
} from './notifications';
import { ALL_PERMISSIONS } from './permissions';

describe('the registry', () => {
  it('gives every trigger a key nobody has to guess at', () => {
    for (const template of NOTIFICATION_TEMPLATES) {
      expect(template.key).toMatch(/^[a-z]+\.[a-z_]+$/);
      expect(template.label.length).toBeGreaterThan(3);
      expect(template.blurb.length).toBeGreaterThan(10);
    }
  });

  it('has no two triggers under one key', () => {
    expect(new Set(NOTIFICATION_KEYS).size).toBe(NOTIFICATION_KEYS.length);
  });

  it('says who each one is for', () => {
    for (const template of NOTIFICATION_TEMPLATES) {
      // Somebody who cannot see payments should not be told one was taken.
      expect(ALL_PERMISSIONS).toContain(template.permission);
    }
  });

  it('declares the values its own text uses', () => {
    for (const template of NOTIFICATION_TEMPLATES) {
      const used = [...`${template.title} ${template.body}`.matchAll(/\{(\w+)\}/g)].map(
        (match) => match[1],
      );
      // The settings screen lists these so a shop rewriting the wording knows
      // what it may put in it.
      for (const name of used) expect(template.values).toContain(name);
    }
  });

  it('finds one by key, and nothing by a key that is not there', () => {
    expect(templateFor('order.moved')?.label).toBe('An order moves on');
    expect(templateFor('nothing.here')).toBeUndefined();
  });
});

describe('filling in a template', () => {
  it('puts the values where they go', () => {
    expect(
      renderNotification('{who} moved {order} to {stage} for {client}.', {
        who: 'Rajat',
        order: 'ORD-2627-0003',
        stage: 'Cutting',
        client: 'Verma Interiors',
      }),
    ).toBe('Rajat moved ORD-2627-0003 to Cutting for Verma Interiors.');
  });

  it('drops a placeholder nothing was given for', () => {
    // A move with no reason should read as a sentence, not as a form with a
    // hole in it.
    expect(
      renderNotification('{who} sent {order} back to {stage}. {reason}', {
        who: 'Nakul',
        order: 'ORD-1',
        stage: 'Design',
      }),
    ).toBe('Nakul sent ORD-1 back to Design.');
  });

  it('leaves no double spaces behind', () => {
    expect(renderNotification('{a} and {b} and {c}', { a: 'one', c: 'three' })).toBe(
      'one and and three',
    );
  });

  it('does not show a raw placeholder to anybody', () => {
    expect(renderNotification('{unknown}', {})).toBe('');
  });
});
