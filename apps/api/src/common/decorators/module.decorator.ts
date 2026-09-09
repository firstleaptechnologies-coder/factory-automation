import { SetMetadata } from '@nestjs/common';
import type { ModuleKey } from '@fas/shared';

export const MODULE_KEY = 'requiredModule';

/**
 * What the workspace must have bought for this to be reachable.
 *
 * Separate from the permission on the same route, and both must pass: the plan
 * decides what the business bought, the role decides who inside it may touch
 * it. Hiding a menu item is not access control, so the check lives here as
 * well as in the menu.
 */
export const RequireModule = (module: ModuleKey) => SetMetadata(MODULE_KEY, module);
