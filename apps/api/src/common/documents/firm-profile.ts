import type { PrismaService } from '../prisma/prisma.service';
import { tenantId } from '../tenancy/tenant-context';

/**
 * The shop's own letterhead details, creating the row if it has never been
 * filled in.
 *
 * A tenant that has never opened Firm details still has to be able to print —
 * so this is created on first read rather than being a missing-record error on
 * the way to a PDF. Kept in one place because both the quotation and the
 * priced enquiry print on the same paper, and a second copy of this would
 * eventually default something differently.
 */
export async function firmProfileOrCreate(prisma: PrismaService) {
  const profile = await prisma.firmProfile.findFirst();
  if (profile) return profile;

  return prisma.firmProfile.create({
    data: { tenantId: tenantId(), name: 'Your firm' },
  });
}
