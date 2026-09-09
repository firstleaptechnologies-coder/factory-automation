import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { TenantStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantRegistryService } from '../../common/tenancy/tenant-registry.service';
import { runInTenant, tenantId } from '../../common/tenancy/tenant-context';

/**
 * How long a support session lasts.
 *
 * Short on purpose. Somebody helping a shop for twenty minutes should not be
 * holding a key to their business at the end of the day, and a token that
 * cannot be revoked is a token that has to expire.
 */
export const SESSION = '30m';

/**
 * Opening somebody's workspace to help them.
 *
 * The one platform power that reaches inside a shop's own data, so it is built
 * to be visible rather than convenient:
 *
 *  - it needs a reason, in words, before it will issue anything;
 *  - it writes that reason into the *shop's own* audit trail, so they can see
 *    we were there whether or not anybody told them;
 *  - the token expires in half an hour and carries who is really using it, so
 *    every change made through it is signed with the support person's name;
 *  - it borrows an existing account rather than inventing one, so nothing can
 *    be done that somebody in the shop could not have done themselves.
 */
@Injectable()
export class ImpersonationService {
  private readonly logger = new Logger('Impersonation');

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: TenantRegistryService,
    private readonly jwt: JwtService,
  ) {}

  async start(
    workspaceId: string,
    reason: string,
    actor: { id: string; name?: string },
  ): Promise<{ accessToken: string; workspace: { slug: string; name: string }; as: string; expiresIn: string }> {
    if (!reason?.trim() || reason.trim().length < 8) {
      // Not a formality: this sentence is what the shop reads in their own
      // history months later.
      throw new BadRequestException(
        'Say why this workspace is being opened — it is written into their own history',
      );
    }

    const workspace = await this.prisma.platform.tenant.findUnique({ where: { id: workspaceId } });
    if (!workspace) throw new NotFoundException('No such workspace');
    if (workspace.status === TenantStatus.SUSPENDED) {
      throw new ForbiddenException('That workspace is suspended');
    }

    const context = await this.registry.byIdOrThrow(workspace.id);

    /*
     * Borrow their owner's account rather than invent an identity.
     *
     * An account of our own inside their workspace would be a second thing to
     * secure, and would be able to do things nobody they employ can do. This
     * way the ceiling is whatever their own admin may do.
     */
    const account = await runInTenant(context, () =>
      this.prisma.user.findFirst({
        where: { isActive: true, role: UserRole.ADMIN },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, code: true, role: true },
      }),
    );
    if (!account) {
      throw new BadRequestException('That workspace has no active administrator to work as');
    }

    const impersonatedBy = { id: actor.id, name: actor.name ?? 'FirstLeap support' };

    const accessToken = await this.jwt.signAsync(
      {
        sub: account.id,
        tenantId: workspace.id,
        code: account.code,
        role: account.role,
        impersonatedBy,
      },
      { expiresIn: SESSION },
    );

    await this.record(context, account.id, reason.trim(), impersonatedBy);
    this.logger.warn(
      `${impersonatedBy.name} opened ${workspace.slug} as ${account.code}: ${reason.trim()}`,
    );

    return {
      accessToken,
      workspace: { slug: workspace.slug, name: workspace.name },
      as: account.name,
      expiresIn: SESSION,
    };
  }

  /**
   * Written into the shop's own trail, not only into ours.
   *
   * Ours would answer "did we go in"; theirs answers "did somebody go into my
   * business", which is the question that matters and the one they can ask
   * without us.
   */
  private async record(
    context: Awaited<ReturnType<TenantRegistryService['byIdOrThrow']>>,
    userId: string,
    reason: string,
    by: { id: string; name: string },
  ): Promise<void> {
    try {
      await runInTenant(context, () =>
        this.prisma.auditLog.create({
          data: {
            tenantId: tenantId(),
            entity: 'Workspace',
            entityId: context.tenantId,
            entityCode: context.slug,
            action: 'workspace.opened_by_support',
            reason,
            after: { as: userId, by: by.name },
            actorLabel: `${by.name} (FirstLeap support)`,
          },
        }),
      );
    } catch (error) {
      // If it cannot be recorded it does not happen: the whole point is that
      // they can see it.
      throw new ForbiddenException(
        `Could not record this in the workspace's history, so it was not opened (${
          error instanceof Error ? error.message : String(error)
        })`,
      );
    }
  }
}
