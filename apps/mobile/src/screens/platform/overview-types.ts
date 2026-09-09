import type { Bill } from '@fas/shared';
import { palette } from '../../theme';

/**
 * The shape `/platform/overview` answers with.
 *
 * Duplicated from the web app deliberately: the two clients are separate
 * packages and mobile is outside the npm workspaces, so a shared type would
 * have to move into @fas/shared — which is where it belongs once a third
 * caller wants it, and not before.
 */
export interface PlatformWorkspace {
  id: string;
  slug: string;
  name: string;
  status: string;
  isolation: string;
  contactName: string | null;
  createdAt: string;
  tier: string | null;
  tierLabel: string | null;
  unknownPlan: boolean;
  extras: string[];
  bill: Bill;
}

export interface PlatformTier {
  key: string;
  label: string;
  blurb: string | null;
  monthlyPrice: number;
  includedModules: string[];
  planModules: string[];
  isActive: boolean;
}

export interface PlatformModulePrice {
  moduleKey: string;
  label: string;
  blurb: string;
  comingSoon: boolean;
  monthlyPrice: number;
  isPriced: boolean;
}

export interface PlatformOverview {
  workspaces: PlatformWorkspace[];
  tiers: PlatformTier[];
  modulePrices: PlatformModulePrice[];
  totals: {
    workspaces: number;
    byStatus: Record<string, number>;
    monthlyRecurring: number;
    paying: number;
    /** Ours. Not revenue, and said so rather than silently missing. */
    internal: number;
    unpricedModules: string[];
    unknownPlans: number;
  };
}

export function statusColour(status: string): string {
  if (status === 'ACTIVE') return palette.success;
  if (status === 'SUSPENDED') return palette.danger;
  if (status === 'TRIAL') return palette.info;
  return palette.textMuted;
}

/**
 * The two things worth interrupting somebody about.
 *
 * An unpriced module a client already has is money nobody is collecting, and a
 * plan key with no tier behind it is a client whose bill cannot be computed at
 * all. Both are quiet failures — neither breaks anything, and both cost money
 * every month they go unnoticed.
 */
export function unpricedWarning(totals: PlatformOverview['totals']):
  | { title: string; body: string }
  | null {
  const parts: string[] = [];

  if (totals.unpricedModules.length) {
    parts.push(
      `${totals.unpricedModules.join(', ')} ${totals.unpricedModules.length === 1 ? 'is' : 'are'} switched on for a client and priced for nobody.`,
    );
  }
  if (totals.unknownPlans) {
    parts.push(
      `${totals.unknownPlans} workspace${totals.unknownPlans === 1 ? ' is' : 's are'} on a plan key that matches no tier, so nothing can be charged for it.`,
    );
  }

  if (!parts.length) return null;
  return { title: 'Money nobody is collecting', body: parts.join(' ') };
}
