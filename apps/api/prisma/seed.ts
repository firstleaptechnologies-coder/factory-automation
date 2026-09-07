/**
 * Bootstraps the platform and its first workspace.
 *
 * The platform layer sits above every tenant: it holds the super admins who
 * provision workspaces. Decor Bucket is created here as tenant one, seeded the
 * same way any future client will be — through the provisioning service, so the
 * path a real customer takes is the path that is exercised on every reset.
 */
import { PrismaClient, TenantIsolation, TenantStatus } from '@prisma/client';
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

  let tenant = await prisma.tenant.findUnique({ where: { slug: 'decorbucket' } });

  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        slug: 'decorbucket',
        name: 'Decor Bucket',
        isolation: TenantIsolation.SHARED,
        status: TenantStatus.ACTIVE,
        plan: 'standard',
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

  // eslint-disable-next-line no-console
  console.log('Seed complete:', counts);
  // eslint-disable-next-line no-console
  console.log(`Platform: ${platformAdmin.email} / platform123`);
  // eslint-disable-next-line no-console
  console.log(`Workspace: ${tenant.slug}  ->  ADMIN / admin123`);
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
