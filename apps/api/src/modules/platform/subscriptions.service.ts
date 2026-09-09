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
import { TenantRegistryService } from '../../common/tenancy/tenant-registry.service';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantRegistryService,
  ) {}

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

  /**
   * A tier the owner wrote, rather than one the code shipped with.
   *
   * The three seeded tiers were what existed before there was anywhere to keep
   * them. What we sell changes faster than we ship, so a new bundle is a row.
   */
  async createTier(input: {
    key: string;
    label: string;
    blurb?: string;
    monthlyPrice?: number;
    includedModules?: string[];
  }) {
    const key = input.key.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    if (key.length < 2) throw new BadRequestException('A tier needs a key');
    if ((input.monthlyPrice ?? 0) < 0) {
      throw new BadRequestException('A tier cannot cost less than nothing');
    }

    const clash = await this.db.subscriptionTier.findUnique({ where: { key } });
    if (clash) throw new BadRequestException(`There is already a tier called "${key}"`);

    const modules = input.includedModules ?? [];
    const unknown = modules.filter((one) => !(ALL_MODULES as string[]).includes(one));
    if (unknown.length) throw new BadRequestException(`There is no module called "${unknown[0]}"`);

    const last = await this.db.subscriptionTier.findFirst({ orderBy: { sortOrder: 'desc' } });

    const row = await this.db.subscriptionTier.create({
      data: {
        key,
        label: input.label.trim(),
        blurb: input.blurb ?? '',
        monthlyPrice: input.monthlyPrice ?? 0,
        includedModules: modules,
        sortOrder: (last?.sortOrder ?? 0) + 10,
      },
    });

    return { ...row, monthlyPrice: Number(row.monthlyPrice) };
  }

  /**
   * Remove a tier.
   *
   * Refused while anybody is on it, and refused for the seeded three — those
   * are what a workspace with an unrecognised key falls back to, so deleting
   * one turns a bad key into no product at all rather than a default one.
   */
  async deleteTier(key: string) {
    const tier = await this.db.subscriptionTier.findUnique({ where: { key } });
    if (!tier) throw new NotFoundException(`There is no tier called "${key}"`);
    if (PLANS.some((plan) => plan.key === key)) {
      throw new BadRequestException('A seeded tier cannot be removed, only switched off');
    }

    const on = await this.db.tenant.count({ where: { plan: key } });
    if (on > 0) {
      throw new BadRequestException(
        `${on} ${on === 1 ? 'workspace is' : 'workspaces are'} on this tier. Move them first`,
      );
    }

    return this.db.subscriptionTier.delete({ where: { key } });
  }

  /**
   * What changing a tier would do to the workspaces already on it.
   *
   * Asked before the save, not discovered after it. Editing a tier is the one
   * screen on the platform where a careless tick takes a module away from a
   * shop that is using it today — so the screen has to be able to say whose,
   * and what.
   */
  async effectOfTierChange(key: string, includedModules: string[]) {
    const tier = await this.db.subscriptionTier.findUnique({ where: { key } });
    if (!tier) throw new NotFoundException(`There is no tier called "${key}"`);

    const on = await this.db.tenant.findMany({
      where: { plan: key },
      select: { id: true, name: true, slug: true, modules: true },
    });

    const before = new Set(tier.includedModules);
    const after = new Set(includedModules);
    const losing = [...before].filter((one) => !after.has(one));
    const gaining = [...after].filter((one) => !before.has(one));

    return {
      gaining,
      // A workspace granted the module directly keeps it, so it is not a loss
      // for them. Counting them in would make the warning cry wolf.
      losing: losing.map((module) => ({
        module,
        label: MODULE_CATALOGUE.find((one) => one.key === module)?.label ?? module,
        workspaces: on
          .filter((workspace) => !(workspace.modules ?? []).includes(module))
          .map((workspace) => ({ id: workspace.id, name: workspace.name })),
      })),
      workspacesOnTier: on.length,
    };
  }

  /**
   * The book of business: what everybody is on, what they pay, and what needs
   * attention this week.
   *
   * Trials are the reason this is a screen of its own. A trial ending on
   * Friday and one that ended in March are the same `TRIAL` row, and neither
   * is visible in a list sorted by name — which is how a client quietly stops
   * paying and nobody notices for a quarter.
   */
  async billing() {
    const [tenants, tiers, prices] = await Promise.all([
      this.db.tenant.findMany({
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          plan: true,
          modules: true,
          trialEndsAt: true,
          billingDay: true,
          createdAt: true,
        },
      }),
      this.tiers(),
      this.modulePrices(),
    ]);

    const priceMap = Object.fromEntries(prices.map((one) => [one.moduleKey, one.monthlyPrice]));
    const tierMap = new Map(tiers.map((one) => [one.key, one]));
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;

    const rows = tenants.map((tenant) => {
      const tier = tenant.plan ? tierMap.get(tenant.plan) : undefined;
      const bill = billFor(
        tier
          ? {
              key: tier.key,
              label: tier.label,
              blurb: tier.blurb ?? '',
              monthlyPrice: tier.monthlyPrice,
              includedModules: tier.includedModules as never,
            }
          : undefined,
        tenant.modules ?? [],
        priceMap,
      );

      const daysLeft = tenant.trialEndsAt
        ? Math.ceil((tenant.trialEndsAt.getTime() - now) / DAY)
        : null;

      return {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        plan: tenant.plan,
        tierLabel: tier?.label ?? null,
        monthlyTotal: bill.monthlyTotal,
        // Never dropped quietly: an add-on granted with no price is revenue
        // nobody is collecting, and it looks identical to one given away.
        unpriced: bill.unpriced,
        trialEndsAt: tenant.trialEndsAt?.toISOString() ?? null,
        trialDaysLeft: daysLeft,
        billingDay: tenant.billingDay,
      };
    });

    const paying = rows.filter((row) => row.status === TenantStatus.ACTIVE);

    return {
      rows,
      totals: {
        monthlyRecurring: paying.reduce((sum, row) => sum + row.monthlyTotal, 0),
        paying: paying.length,
        onTrial: rows.filter((row) => row.status === TenantStatus.TRIAL).length,
        suspended: rows.filter((row) => row.status === TenantStatus.SUSPENDED).length,
      },
      /*
       * What somebody has to do something about, rather than what is merely
       * true. A trial that ran out is first: every day it stays open is a day
       * of the product given away by accident rather than on purpose.
       */
      needsAttention: {
        trialsExpired: rows.filter(
          (row) => row.status === TenantStatus.TRIAL && row.trialDaysLeft !== null && row.trialDaysLeft < 0,
        ),
        trialsEndingSoon: rows.filter(
          (row) =>
            row.status === TenantStatus.TRIAL &&
            row.trialDaysLeft !== null &&
            row.trialDaysLeft >= 0 &&
            row.trialDaysLeft <= 7,
        ),
        trialsWithNoEnd: rows.filter(
          (row) => row.status === TenantStatus.TRIAL && row.trialEndsAt === null,
        ),
        unpriced: rows.filter((row) => row.unpriced.length > 0),
        payingNothing: paying.filter((row) => row.monthlyTotal === 0),
      },
    };
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

    /*
     * What a tier includes is cached per workspace, so moving a module into a
     * tier has to reach the workspaces already on it. Without this the price
     * list changes and the product does not, until somebody restarts the API —
     * which is indistinguishable from a screen that does not work.
     */
    if (input.includedModules) this.tenants.invalidateAll();

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