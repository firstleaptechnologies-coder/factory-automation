import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { navigationMarkdown } from '../src/navigation-doc';

/** Rewrites docs/NAVIGATION.md from the navigation tree. */
writeFileSync(join(__dirname, '../../../docs/NAVIGATION.md'), navigationMarkdown());
