import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A form never writes back a copy of itself from an earlier render.
 *
 * `setForm({ ...form, name })` spreads the `form` the handler's own render
 * closed over. When two updates happen before React re-renders — a fast
 * typist, a paste, a field filled and a chip tapped in the same breath — the
 * second spreads a copy from before the first and writes it back over it. The
 * field on screen still shows what was typed, so nothing looks wrong until the
 * record comes back missing half of it. A GST rate typed as "GST 18%" reached
 * the server as "GS".
 *
 * The fix is always `setForm((current) => ({ ...current, name }))`, and this
 * is a rail rather than a test per form because no rendering test can
 * reproduce it: the testing library flushes React between events, which is
 * exactly the thing that is not true of a real keyboard.
 *
 * Only a spread of the setter's *own* state is flagged — `setRow({ ...entry })`
 * is somebody else's object and perfectly fine.
 */
const SPREAD = /\bset([A-Z][A-Za-z0-9]*)\(\{\s*\.\.\.([a-z][A-Za-z0-9]*)\s*,/g;

function sources(dir: string): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sources(path));
    else if (/\.tsx?$/.test(path) && !/\.spec\./.test(path)) {
      out.push({ path, text: readFileSync(path, 'utf8') });
    }
  }
  return out;
}

const files = sources(join(__dirname, '..'));

it('reads the source at all, so an empty sweep does not pass silently', () => {
  expect(files.length).toBeGreaterThan(40);
});

it('never spreads its own state into its own setter', () => {
  const offenders: string[] = [];

  for (const file of files) {
    for (const match of file.text.matchAll(SPREAD)) {
      const [, setter, spread] = match;
      const own = setter.charAt(0).toLowerCase() + setter.slice(1);
      if (spread !== own) continue;
      const line = file.text.slice(0, match.index).split('\n').length;
      offenders.push(`${file.path.split('/src/')[1]}:${line}  set${setter}({ ...${spread}, …`);
    }
  }

  expect(offenders).toEqual([]);
});
