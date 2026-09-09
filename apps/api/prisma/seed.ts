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
import { ALL_MODULES } from '@fas/shared';
import * as bcrypt from 'bcryptjs';
import { TenantProvisioningService } from '../src/modules/platform/tenant-provisioning.service';

const prisma = new PrismaClient();

async function main() {
  const platformAdmin = await prisma.platformUser.upsert({
    where: { email: 'platform@decorbucket.app' },
    update: {},
    create: {
      email: 'platform@decorbucket.app',
      name: 'Platform Admin',
      passwordHash: await bcrypt.hash('platform123', 10),
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
      passwordHash: await bcrypt.hash('firstleap123', 10),
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
        contactName: 'Nakul Varshney',
      },
    });

    const provisioning = new TenantProvisioningService();
    await provisioning.seed(prisma, tenant.id, {
      name: 'Administrator',
      code: 'ADMIN',
      password: 'admin123',
      email: 'admin@decorbucket.app',
    });

    // A couple of extra people so roles can be seen working.
    const roles = await prisma.role.findMany({ where: { tenantId: tenant.id } });
    const roleByCode = new Map(roles.map((role) => [role.code, role.id]));

    for (const person of [
      { code: 'SALES01', name: 'Sales Desk', role: 'SALES', password: 'sales123' },
      { code: 'PROD01', name: 'Production', role: 'PRODUCTION', password: 'prod123' },
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
        contactName: 'FirstLeap Technologies',
        notes: 'Ours, for testing. Not a client.',
      },
    });
    await new TenantProvisioningService().seed(prisma, flt.id, {
      name: 'FLT Admin',
      code: 'ADMIN',
      password: 'flt12345',
      email: 'admin@firstleap.in',
    });
  }

  // eslint-disable-next-line no-console
  console.log('Seed complete:', counts);
  // eslint-disable-next-line no-console
  console.log(`Platform: ${platformAdmin.email} / platform123`);
  // eslint-disable-next-line no-console
  console.log(`Workspace: ${tenant.slug}  ->  ADMIN / admin123`);
  // eslint-disable-next-line no-console
  console.log(`Workspace: ${flt.slug}  ->  ADMIN / flt12345  (ours, every module)`);
  // eslint-disable-next-line no-console
  console.log(`Platform: ${firstLeapOwner.email} / firstleap123`);
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
