import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@fas/shared';

export const PERMISSIONS_KEY = 'requiredPermissions';

/**
 * What a caller must be allowed to do.
 *
 * Checked against the permissions on the user's role, not against a role name —
 * so a tenant can rename or recombine roles without the API caring.
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
