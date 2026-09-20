import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OTA_CHANNELS, ROLLOUT_STEPS } from '@fas/shared';

/**
 * The flow page says of itself: "A page that lies about the pipeline is worse
 * than no page: it is consulted precisely when somebody is confused, and it
 * will confirm whatever it says." Nothing checked that it did not.
 *
 * It had already drifted twice. It described the rollout as walking "the
 * percentage" up, from when the screen took any number, and it said a
 * TestFlight binary is "pointed at staging" — naming the channel after the
 * environment, which is the exact confusion `ota-channels.spec.ts` exists to
 * keep out of the code and which had quietly settled into the documentation
 * instead.
 *
 * This reads the page's own text. It cannot tell whether a sentence is true,
 * only whether the page still mentions the things the pipeline is actually
 * made of — which is enough to fail when one of them changes underneath it.
 */
const page = readFileSync(join(__dirname, 'page.tsx'), 'utf8');

describe('the page that says how a release reaches a shop', () => {
  it('names every rung the rollout ladder actually offers', () => {
    // Change ROLLOUT_STEPS and this fails until the page agrees — which is
    // the point: the page is read by whoever is about to press one.
    for (const step of ROLLOUT_STEPS) {
      expect(page).toContain(String(step));
    }
  });

  it('mentions Pause, which is the rung that is not on the ladder', () => {
    expect(page).toMatch(/Pause/);
  });

  it('says that a release cannot be published behind the live one', () => {
    // The server refuses this and both screens disable it. A page that did
    // not say so would send somebody looking for the button.
    expect(page).toMatch(/cannot be published/i);
    expect(page).toMatch(/Roll back/i);
  });

  it('names the channels a binary can carry, and no others', () => {
    for (const channel of OTA_CHANNELS) {
      expect(page).toContain(channel);
    }
  });

  /*
   * The environment is staging; the channel it serves is development. The page
   * may call staging an environment or an API as much as it likes — what it
   * must not do is treat it as the thing baked into the binary, which is what
   * "Point the binary at staging" and "it is pointed at staging, in the
   * binary" both did. Those two sentences are pinned by name, because a
   * general rule against the word would forbid the sentences that are right.
   */
  it('does not say a binary is pointed at an environment', () => {
    expect(page).not.toMatch(/binary at staging/i);
    expect(page).not.toMatch(/pointed at staging/i);
    expect(page).not.toMatch(/staging channel/i);
  });
});
