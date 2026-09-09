import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantStatus } from '@prisma/client';
import {
  ALL_MODULES,
  allJobHealth,
  MODULE_CATALOGUE,
  ModuleKey,
  ModulePrices,
  PLANS,
  Tier,
  billFor,
  monthlyRecurring,
} from '@fas/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

/** A tier row, with its price as a number rather than a Prisma Decimal. */
export interface TierRow {
  id: string;
  key: string;
  label: string;
  blurb: string | null;
  monthlyPrice: number;
  includedModules: string[];
  isActive: boolean;
  sortOrder: number;
  /** What the code says this tier grants, beside what the row says. */
  planModules: readonly ModuleKey[];
}

/**
 * The commercial side of the platform: what a tier costs, what a module costs
 * beyond it, and what every client is therefore paying.
 *
 * Prices live in the platform database and are never scoped to a tenant. What
 * a tier *grants* still comes from `@fas/shared`, because the guards resolve
 * entitlements from it on every request — this decides only what it costs.
 *
 * Nothing here invents a price. A tier or module that has never been priced
 * reads as unpriced rather than as free, and the overview says so out loud: a
 * module a client uses for a year for nothing is the failure this exists to
 * prevent.
 */
@Injectable()
export class SubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.platform;
  }

  /**
   * The tiers, seeded from the plans the code defines.
   *
   * A plan without a row is created at zero and unpriced rather than skipped,
   * so a tier that exists in code always exists commercially — and so adding a
   * plan cannot quietly make a tier nobody can price.
   */
  async tiers(): Promise<TierRow[]> {
    const rows = await this.db.subscriptionTier.findMany({ orderBy: { sortOrder: 'asc' } });
    const byKey = new Map(rows.map((row) => [row.key, row]));

    const missing = PLANS.filter((plan) => !byKey.has(plan.key));
    if (missing.length) {
      await this.db.subscriptionTier.createMany({
        data: missing.map((plan, index) => ({
          key: plan.key,
          label: plan.label,
          blurb: plan.blurb,
          monthlyPrice: 0,
          includedModules: [...plan.modules],
          sortOrder: PLANS.findIndex((p) => p.key === plan.key) * 10 + index,
        })),
        skipDuplicates: true,
      });
      return this.tiers();
    }

    return rows.map((row) => ({
      ...row,
      monthlyPrice: Number(row.monthlyPrice),
      // What the code says this tier grants, beside what the row says. They
      // start identical; the row is what somebody edits.
      planModules: PLANS.find((plan) => plan.key === row.key)?.modules ?? [],
    }));
  }

  /** Every module's price, including the ones nobody has priced yet. */
  async modulePrices() {
    const rows = await this.db.modulePrice.findMany();
    const byKey = new Map(rows.map((row) => [row.moduleKey, row]));

    return MODULE_CATALOGUE.map((module) => {
      const row = byKey.get(module.key);
      return {
        moduleKey: module.key,
        label: module.label,
        blurb: module.blurb,
        comingSoon: Boolean(module.comingSoon),
        monthlyPrice: row ? Number(row.monthlyPrice) : 0,
        isPriced: row?.isPriced ?? false,
      };
    });
  }

  async setTierPrice(
    key: string,
    input: { monthlyPrice?: number; includedModules?: string[]; isActive?: boolean },
  ) {
    if (input.monthlyPrice !== undefined && input.monthlyPrice < 0) {
      throw new BadRequestException('A tier cannot cost less than nothing');
    }
    if (input.includedModules) {
      const unknown = input.includedModules.filter(
        (module) => !(ALL_MODULES as string[]).includes(module),
      );
      if (unknown.length) {
        throw new BadRequestException(`There is no module called "${unknown[0]}"`);
      }
    }

    const existing = await this.db.subscriptionTier.findUnique({ where: { key } });
    if (!existing) throw new NotFoundException(`There is no tier called "${key}"`);

    const row = await this.db.subscriptionTier.update({
      where: { key },
      data: {
        monthlyPrice: input.monthlyPrice ?? undefined,
        includedModules: input.includedModules ?? undefined,
        isActive: input.isActive ?? undefined,
      },
    });
    return { ...row, monthlyPrice: Number(row.monthlyPrice) };
  }

  /**
   * Price one module.
   *
   * Setting a price is what makes it priced. Zero is a decision to give it
   * away and is recorded as one — which is not the same as never having
   * decided, and the two must not look alike on a bill.
   */
  async setModulePrice(moduleKey: string, monthlyPrice: number) {
    if (!(ALL_MODULES as string[]).includes(moduleKey)) {
      throw new BadRequestException(`There is no module called "${moduleKey}"`);
    }
    if (monthlyPrice < 0) {
      throw new BadRequestException('A module cannot cost less than nothing');
    }

    const row = await this.db.modulePrice.upsert({
      where: { moduleKey },
      update: { monthlyPrice, isPriced: true },
      create: { moduleKey, monthlyPrice, isPriced: true },
    });
    return { ...row, monthlyPrice: Number(row.monthlyPrice) };
  }

  /**
   * Everything the dashboard shows, in one call.
   *
   * One round trip because it is a dashboard: three requests that arrive at
   * different moments give a screen that assembles itself in front of you.
   */
  async overview() {
    const [tenants, tiers, prices] = await Promise.all([
      this.db.tenant.findMany({
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          slug: true,
          name: true,
          plan: true,
          modules: true,
          status: true,
          isolation: true,
          contactName: true,
          createdAt: true,
        },
      }),
      this.tiers(),
      this.modulePrices(),
    ]);

    const priceMap: ModulePrices = {};
    for (const price of prices) {
      // Only a priced module contributes. An unpriced one has to reach the
      // bill as unpriced, not as zero.
      if (price.isPriced) priceMap[price.moduleKey as ModuleKey] = price.monthlyPrice;
    }

    const labels: Partial<Record<ModuleKey, string>> = {};
    for (const module of MODULE_CATALOGUE) labels[module.key] = module.label;

    const tierByKey = new Map<string, Tier>(
      tiers.map((tier) => [
        tier.key,
        {
          key: tier.key,
          label: tier.label,
          blurb: tier.blurb ?? '',
          monthlyPrice: tier.monthlyPrice,
          includedModules: tier.includedModules as ModuleKey[],
          isActive: tier.isActive,
        },
      ]),
    );

    const workspaces = tenants.map((tenant) => {
      const tier = tenant.plan ? tierByKey.get(tenant.plan) : undefined;
      const bill = billFor(tier, tenant.modules, priceMap, labels);

      return {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        status: tenant.status,
        isolation: tenant.isolation,
        contactName: tenant.contactName,
        createdAt: tenant.createdAt,
        tier: tier?.key ?? null,
        tierLabel: tier?.label ?? null,
        /**
         * A plan key with no tier behind it. The seed shipped `standard` for
         * a year, which resolves to the default plan for entitlements and to
         * nothing at all here — worth showing rather than treating as none.
         */
        unknownPlan: Boolean(tenant.plan && !tier),
        extras: tenant.modules,
        bill,
      };
    });

    const revenue = monthlyRecurring(
      workspaces.map((w) => ({ status: w.status, monthlyTotal: w.bill.monthlyTotal })),
    );

    const byStatus: Record<string, number> = {};
    for (const status of Object.values(TenantStatus)) byStatus[status] = 0;
    for (const workspace of workspaces) byStatus[workspace.status] += 1;

    return {
      workspaces,
      tiers,
      modulePrices: prices,
      totals: {
        workspaces: workspaces.length,
        byStatus,
        monthlyRecurring: revenue.total,
        paying: revenue.active,
        /** Granted somewhere and priced nowhere. The number to drive to zero. */
        unpricedModules: [
          ...new Set(workspaces.flatMap((workspace) => workspace.bill.unpriced)),
        ],
        /** Workspaces on a plan key no tier matches. */
        unknownPlans: workspaces.filter((workspace) => workspace.unknownPlan).length,
      },
    };
  }

  /**
   * Whether the work on a clock actually ran.
   *
   * Reads the most recent run of each job. The rows have always been written
   * and never read, so the one failure that matters — a job that stopped —
   * has been invisible: a failure leaves a row with an error on it, and a
   * missed run leaves nothing at all, which looks exactly like a quiet night.
   *
   * `JobRun` is platform-wide rather than a tenant's, so this reads the
   * platform client directly.
   */
  async jobHealth() {
    // A fortnight is enough to date every job on the board; older rows are
    // pruned nightly anyway.
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const runs = await this.db.jobRun.findMany({
      where: { startedAt: { gte: since } },
      orderBy: { startedAt: 'desc' },
      take: 500,
      select: {
        name: true,
        outcome: true,
        startedAt: true,
        finishedAt: true,
        durationMs: true,
        detail: true,
        error: true,
      },
    });

    return allJobHealth(runs as never);
  }

}