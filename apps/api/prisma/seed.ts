/**
 * Bootstraps the platform and its first workspace.
 *
 * The platform layer sits above every tenant: it holds FirstLeap's own staff,
 * who provision workspaces. Two workspaces are created here, both through the
 * provisioning service, so the path a real customer takes is the path that is
 * exercised on every reset:
 *
 *  - **Decor Bucket**, the first paying client, on what they have bought.
 *  - **FLT**, ours, with every module on — so a change can be seen working
 *    before a client sees it, and so an unbought module being visible is
 *    obvious in the one workspace that should show everything.
 */
import { PrismaClient, TenantIsolation, TenantStatus } from '@prisma/client';
import { ALL_MODULES, PLANS } from '@fas/shared';
import * as bcrypt from 'bcryptjs';
import { TenantProvisioningService } from '../src/modules/platform/tenant-provisioning.service';

const prisma = new PrismaClient();

/**
 * What we charge, as a starting point rather than a decision.
 *
 * A tier row created without a price is created at zero, and zero is
 * indistinguishable on every screen from "given away on purpose" — so a fresh
 * database that has never been priced shows a book of business worth nothing
 * and nobody notices. These are numbers to argue with, and every one of them
 * is editable on the platform's own price list.
 *
 * The add-ons are weighted rather than flat: Purchasing and People are whole
 * modules with their own workflow, Expenses is a ledger and a form.
 */
const TIER_PRICES: Record<string, number> = {
  punch: 3000,
  shop: 8000,
  works: 15000,
};

const MODULE_PRICES: Record<string, number> = {
  // In every product, and never charged for separately. Priced at zero
  // deliberately, which is not the same as never having decided.
  orders: 0,
  clients: 0,

  leads: 1500,
  quotes: 1500,
  finance: 2500,
  expenses: 1000,
  reports: 1000,
  purchasing: 2500,
  hr: 2500,
  analytics: 2000,
  ai: 2500,
};

async function seedPrices() {
  for (const plan of PLANS) {
    await prisma.subscriptionTier.upsert({
      where: { key: plan.key },
      // Left alone if it already exists: these are a starting point, and
      // overwriting a price somebody set is the one thing a seed must not do.
      update: {},
      create: {
        key: plan.key,
        label: plan.label,
        blurb: plan.blurb,
        monthlyPrice: TIER_PRICES[plan.key] ?? 0,
        includedModules: [...plan.modules],
        sortOrder: PLANS.findIndex((one) => one.key === plan.key) * 10,
      },
    });
  }

  for (const [moduleKey, monthlyPrice] of Object.entries(MODULE_PRICES)) {
    await prisma.modulePrice.upsert({
      where: { moduleKey },
      update: {},
      create: { moduleKey, monthlyPrice, isPriced: true },
    });
  }
}

/**
 * A seeded password, from the environment where one is given.
 *
 * The defaults below are development passwords, and this repository is public:
 * anyone who can read seed.ts knows them. That is fine on a laptop and is an
 * open door on an API with a public address, so in production there are no
 * defaults — the variable is supplied or the seed refuses to run.
 *
 * Refusing is the point. A seed that quietly falls back to "admin123" on a
 * shop's live database is one where nothing looks wrong until somebody else
 * logs in.
 */
function seedPassword(variable: string, developmentDefault: string): string {
  const given = process.env[variable];
  if (given && given.length >= 12) return given;

  if (process.env.APP_ENV === 'production') {
    throw new Error(
      given
        ? `${variable} is too short — 12 characters or more, please.`
        : `${variable} must be set when APP_ENV=production. ` +
          'Seeding a live workspace with a password from a public repository ' +
          'is not something this script will do quietly.',
    );
  }
  return developmentDefault;
}

async function main() {
  const platformAdmin = await prisma.platformUser.upsert({
    where: { email: 'platform@decorbucket.app' },
    update: {},
    create: {
      email: 'platform@decorbucket.app',
      name: 'Platform Admin',
      passwordHash: await bcrypt.hash(seedPassword('SEED_PLATFORM_PASSWORD', 'platform123'), 10),
    },
  });

  // FirstLeap's own owner. The seeded platform account above is named after
  // the first client, which was true when the product was, and is not now.
  const firstLeapOwner = await prisma.platformUser.upsert({
    where: { email: 'admin@firstleap.in' },
    update: {},
    create: {
      email: 'admin@firstleap.in',
      name: 'FirstLeap Owner',
      role: 'OWNER',
      passwordHash: await bcrypt.hash(seedPassword('SEED_FIRSTLEAP_PASSWORD', 'firstleap123'), 10),
    },
  });

  let tenant = await prisma.tenant.findUnique({ where: { slug: 'decorbucket' } });

  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        slug: 'decorbucket',
        name: 'Decor Bucket',
        isolation: TenantIsolation.SHARED,
        status: TenantStatus.ACTIVE,
        // What Decor Bucket has bought. Not 'standard' — that is not a plan
        // key, and it only ever worked because planFor() falls back.
        plan: 'shop',
        // The day they started, capped at 28 — see the migration note.
        billingDay: Math.min(new Date().getUTCDate(), 28),
        contactName: 'Nakul Varshney',
      },
    });

    const provisioning = new TenantProvisioningService();
    await provisioning.seed(prisma, tenant.id, {
      name: 'Administrator',
      code: 'ADMIN',
      password: seedPassword('SEED_TENANT_ADMIN_PASSWORD', 'admin123'),
      email: 'admin@decorbucket.app',
    });

    // A couple of extra people so roles can be seen working.
    const roles = await prisma.role.findMany({ where: { tenantId: tenant.id } });
    const roleByCode = new Map(roles.map((role) => [role.code, role.id]));

    for (const person of [
      { code: 'SALES01', name: 'Sales Desk', role: 'SALES',
        password: seedPassword('SEED_SALES_PASSWORD', 'sales123') },
      { code: 'PROD01', name: 'Production', role: 'PRODUCTION',
        password: seedPassword('SEED_PRODUCTION_PASSWORD', 'prod123') },
    ]) {
      await prisma.user.create({
        data: {
          tenantId: tenant.id,
          code: person.code,
          name: person.name,
          passwordHash: await bcrypt.hash(person.password, 10),
          role: person.role as never,
          roleId: roleByCode.get(person.role),
        },
      });
    }
  }

  const counts = {
    platformAdmins: await prisma.platformUser.count(),
    tenants: await prisma.tenant.count(),
    roles: await prisma.role.count({ where: { tenantId: tenant.id } }),
    gstSlabs: await prisma.gstSlab.count({ where: { tenantId: tenant.id } }),
    materials: await prisma.material.count({ where: { tenantId: tenant.id } }),
    orderStages: await prisma.workflowStatus.count({
      where: { tenantId: tenant.id, workflow: { kind: 'ORDER' } },
    }),
    users: await prisma.user.count({ where: { tenantId: tenant.id } }),
  };

  // Our own workspace. Every module, including the ones that do not exist
  // yet, so nothing about it depends on what a plan happens to contain later.
  let flt = await prisma.tenant.findUnique({ where: { slug: 'flt' } });
  if (!flt) {
    flt = await prisma.tenant.create({
      data: {
        slug: 'flt',
        name: 'FirstLeap Technologies (FLT)',
        isolation: TenantIsolation.SHARED,
        status: TenantStatus.ACTIVE,
        plan: 'works',
        modules: [...ALL_MODULES],
        // Ours. It is ACTIVE and on every module, which is exactly what a
        // paying client looks like from the billing screen — so it says so
        // here rather than being guessed at from the slug.
        isInternal: true,
        billingDay: Math.min(new Date().getUTCDate(), 28),
        contactName: 'FirstLeap Technologies',
        notes: 'Ours, for testing. Not a client.',
      },
    });
    await new TenantProvisioningService().seed(prisma, flt.id, {
      name: 'FLT Admin',
      code: 'ADMIN',
      password: seedPassword('SEED_FLT_ADMIN_PASSWORD', 'flt12345'),
      email: 'admin@firstleap.in',
    });
  }

  await seedPrices();

  // eslint-disable-next-line no-console
  console.log('Seed complete:', counts);
  // Accounts, not passwords. In development they are the defaults in
  // seedPassword; in production they came from the environment, and echoing a
  // live credential into a deploy log is how it ends up somewhere permanent.
  // eslint-disable-next-line no-console
  console.log(`Platform: ${platformAdmin.email}`);
  // eslint-disable-next-line no-console
  console.log(`Workspace: ${tenant.slug}  ->  ADMIN`);
  // eslint-disable-next-line no-console
  console.log(`Workspace: ${flt.slug}  ->  ADMIN  (ours, every module)`);
  // eslint-disable-next-line no-console
  console.log(`Platform: ${firstLeapOwner.email}`);
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
