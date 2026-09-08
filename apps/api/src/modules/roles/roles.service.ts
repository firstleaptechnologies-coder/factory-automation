import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PERMISSIONS } from '@decor/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { tenantId } from '../../common/tenancy/tenant-context';
import { AssignRoleDto, RoleDto } from './dto/role.dto';

const INCLUDE = { _count: { select: { users: true } } } as const;

/**
 * What each kind of person here may do.
 *
 * Roles are the shop's to write. The seeded four are a starting point, not a
 * fixed set: a shop with a separate accountant, or one where the same person
 * does sales and dispatch, should be able to say so without asking us.
 */
@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.role.findMany({
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      include: INCLUDE,
    });
  }

  async create(dto: RoleDto) {
    const name = dto.name.trim();
    const code = codeFor(name);

    const clash = await this.prisma.role.findFirst({ where: { code } });
    if (clash) throw new BadRequestException(`There is already a role called "${name}"`);

    return this.prisma.role.create({
      data: {
        tenantId: tenantId(),
        code,
        name,
        description: dto.description?.trim() || null,
        permissions: dto.permissions,
      },
      include: INCLUDE,
    });
  }

  /**
   * A seeded role can be edited — a shop that wants its Sales to see payouts
   * should not have to build a second role to say so — but not renamed out of
   * recognition or deleted, because the provisioning that made it expects it.
   */
  async update(id: string, dto: RoleDto) {
    const role = await this.prisma.role.findFirst({ where: { id } });
    if (!role) throw new NotFoundException('Role not found');

    await this.refuseSelfLockout(role.id, dto.permissions);

    return this.prisma.role.update({
      where: { id },
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        permissions: dto.permissions,
      },
      include: INCLUDE,
    });
  }

  async remove(id: string) {
    const role = await this.prisma.role.findFirst({
      where: { id },
      include: INCLUDE,
    });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem) {
      throw new BadRequestException(
        'That is one of the roles this workspace was set up with. It can be edited, not removed.',
      );
    }
    if (role._count.users > 0) {
      throw new BadRequestException(
        `${role._count.users} ${role._count.users === 1 ? 'person is' : 'people are'} on that role. Move them first.`,
      );
    }

    await this.prisma.role.delete({ where: { id } });
    return { id };
  }

  /** Puts somebody on a role, or takes their role away. */
  async assign(userId: string, dto: AssignRoleDto) {
    const user = await this.prisma.user.findFirst({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (dto.roleId) {
      const role = await this.prisma.role.findFirst({ where: { id: dto.roleId } });
      if (!role) throw new NotFoundException('Role not found');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { roleId: dto.roleId ?? null },
      select: { id: true, code: true, name: true, roleId: true, isActive: true },
    });
  }

  /**
   * Refuses to take role management off the last role that has it.
   *
   * Not a hypothetical: a shop tidying its Owner role and unticking one box
   * would lock every one of them out of this screen, and the way back is
   * somebody with database access. Checked here rather than on the screen,
   * because the screen is not the only way in.
   */
  private async refuseSelfLockout(id: string, permissions: string[]) {
    if (permissions.includes(PERMISSIONS.ROLE_MANAGE)) return;

    const others = await this.prisma.role.count({
      where: {
        id: { not: id },
        permissions: { has: PERMISSIONS.ROLE_MANAGE },
        users: { some: { isActive: true } },
      },
    });
    if (others === 0) {
      throw new BadRequestException(
        'That would leave nobody able to manage roles. Give another role that permission first.',
      );
    }
  }
}

/**
 * A stable code from a name.
 *
 * The name is what people read and may be changed; the code is what the seed
 * and any future import match on, so it is derived once and left alone.
 */
export function codeFor(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30);
}
