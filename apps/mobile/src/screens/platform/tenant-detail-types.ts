/**
 * One workspace as the console reads it.
 *
 * Written out rather than inferred from the client, which returns `unknown`
 * for the platform calls: a screen that guesses at a payload shape is a screen
 * that renders `undefined` the day the payload changes.
 */
export interface TenantDetail {
  id: string;
  slug: string;
  name: string;
  status: 'ACTIVE' | 'TRIAL' | 'SUSPENDED';
  isolation: 'SHARED' | 'DEDICATED';
  plan: string | null;
  modules: string[];
  hasDedicatedDatabase: boolean;
  /** Ours, not a client's. Kept out of every revenue figure. */
  isInternal?: boolean;
  effectiveModules: string[];
  /** Their database could not be reached, so their people are not shown. */
  unreachable?: boolean;
  counts?: { users: number | null; orders: number | null; clients: number | null };
  health?: {
    lastSeenAt: string | null;
    writes: number;
    failures: number;
    clientErrors: number;
  };
  tier?: { key: string; label: string; monthlyPrice: number; includedModules: string[] } | null;
  users?: {
    id: string;
    code: string;
    name: string;
    isActive: boolean;
    roleRef?: { name: string } | null;
  }[];
  roles?: {
    id: string;
    name: string;
    permissions: string[];
    isSystem: boolean;
    _count?: { users: number };
  }[];
}
