import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PERMISSIONS, PLATFORM_PERMISSIONS, PLATFORM_ROLES } from '@fas/shared';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Who at FirstLeap may do what.
 *
 * The roles used to be four constants in shared code, which meant the shape of
 * the company was a release. They are rows now, seeded from those same four so
 * nothing changes on the day this ships, and editable afterwards.
 *
 * Two things this refuses, and both are about the same failure — locking
 * ourselves out of our own platform, which no amount of care in the browser
 * prevents:
 *
 *  - A save that would leave nobody able to manage staff. There is no support
 *    desk above us to undo it.
 *  - Somebody stripping their own ability to manage staff, or switching
 *    themselves off. That is the same lock-out, one step slower.
 *
 * A platform permission is the only kind that may be granted here. A tenant
 * permission on a platform role would grant nothing — platform users are not
 * inside anybody's workspace — but it would read as if it did.
 */
@Injectable()
export class PlatformStaffService {
  constructor(private readonly prisma: PrismaService) {}

  /*
   * The platform database, explicitly.
   *
   * These rows belong to nobody's workspace, so they are read through the
   * platform client rather than the tenant-scoped one — which would ask for a
   * tenant that a platform user does not have.
   */
  private get db() {
    return this.prisma.platform;
  }

  /** The seeded four, written once, so an empty table is not an empty screen. */
  async seed() {
    for (const role of PLATFORM_ROLES) {
      await this.db.platformRole.upsert({
        where: { key: role.key },
        update: {},
        create: {
          key: role.key,
          name: role.label,
          blurb: role.blurb,
          permissions: [...role.permissions],
          isSystem: true,
        },
      });
    }
  }

  async roles() {
    await this.seed();
    const [roles, staff] = await Promise.all([
      this.db.platformRole.findMany({ orderBy: { createdAt: 'asc' } }),
      this.db.platformUser.findMany({ select: { role: true, isActive: true } }),
    ]);

    return roles.map((role) => ({
      ...role,
      people: staff.filter((one) => one.role === role.key).length,
    }));
  }

  /**
   * What a role holds today, for the gate on every request.
   *
   * A missing row falls back to the shared definition rather than to nothing:
   * a role deleted underneath a live session should not silently turn a
   * colleague into someone who can do nothing at all, and it must certainly
   * not turn them into someone who can do everything.
   */
  async permissionsFor(key: string): Promise<string[]> {
    const row = await this.db.platformRole.findUnique({ where: { key } });
    if (row) return row.permissions;

    const seeded = PLATFORM_ROLES.find((one) => one.key === key);
    return seeded ? [...seeded.permissions] : [PERMISSIONS.PLATFORM_TENANT_VIEW];
  }

  async saveRole(
    key: string,
    body: { name?: string; blurb?: string; permissions: string[] },
    actorId: string,
  ) {
    const role = await this.db.platformRole.findUnique({ where: { key } });
    if (!role) throw new NotFoundException('No such role');

    const permissions = this.onlyPlatform(body.permissions);
    await this.refuseLockout(key, permissions, actorId);

    return this.db.platformRole.update({
      where: { key },
      data: {
        name: body.name?.trim() || role.name,
        blurb: body.blurb ?? role.blurb,
        permissions,
      },
    });
  }

  async createRole(body: { key: string; name: string; blurb?: string; permissions: string[] }) {
    const key = body.key.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    if (key.length < 2) throw new BadRequestException('A role needs a key');

    const clash = await this.db.platformRole.findUnique({ where: { key } });
    if (clash) throw new BadRequestException('A role with that key already exists');

    return this.db.platformRole.create({
      data: {
        key,
        name: body.name.trim(),
        blurb: body.blurb ?? '',
        permissions: this.onlyPlatform(body.permissions),
        isSystem: false,
      },
    });
  }

  async deleteRole(key: string) {
    const role = await this.db.platformRole.findUnique({ where: { key } });
    if (!role) throw new NotFoundException('No such role');
    // The seeded four are what a session falls back to. Removing one turns
    // every colleague on it into somebody the fallback has to guess about.
    if (role.isSystem) throw new BadRequestException('A seeded role cannot be removed');

    const holders = await this.db.platformUser.count({ where: { role: key } });
    if (holders > 0) throw new BadRequestException('Somebody is still on this role');

    return this.db.platformRole.delete({ where: { key } });
  }

  async staff() {
    return this.db.platformUser.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });
  }

  async createStaff(body: { email: string; name: string; role: string; password: string }) {
    const role = await this.db.platformRole.findUnique({ where: { key: body.role } });
    if (!role) throw new NotFoundException('No such role');

    const email = body.email.trim().toLowerCase();
    const clash = await this.db.platformUser.findUnique({ where: { email } });
    if (clash) throw new BadRequestException('Somebody already signs in with that address');

    const created = await this.db.platformUser.create({
      data: {
        email,
        name: body.name.trim(),
        role: body.role,
        passwordHash: await bcrypt.hash(body.password, 10),
      },
      select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
    });

    return created;
  }

  async saveStaff(
    id: string,
    body: { name?: string; role?: string; isActive?: boolean },
    actorId: string,
  ) {
    const person = await this.db.platformUser.findUnique({ where: { id } });
    if (!person) throw new NotFoundException('No such person');

    if (body.role) {
      const role = await this.db.platformRole.findUnique({ where: { key: body.role } });
      if (!role) throw new NotFoundException('No such role');
    }

    // Somebody moving themselves off staff management, or switching themselves
    // off, is the lock-out one step slower than doing it to the role.
    if (id === actorId) {
      if (body.isActive === false) {
        throw new BadRequestException('You cannot switch yourself off');
      }
      if (body.role && body.role !== person.role) {
        const next = await this.permissionsFor(body.role);
        if (!next.includes(PERMISSIONS.PLATFORM_STAFF_MANAGE)) {
          throw new BadRequestException(
            'That role cannot manage staff, and moving yourself onto it would lock you out',
          );
        }
      }
    }

    // Checked before the write, not after: a check that throws once the row is
    // already saved has described the lock-out rather than prevented it.
    await this.refuseNobodyLeft({
      id,
      role: body.role ?? person.role,
      isActive: body.isActive ?? person.isActive,
    });

    return this.db.platformUser.update({
      where: { id },
      data: {
        name: body.name?.trim() || person.name,
        role: body.role ?? person.role,
        isActive: body.isActive ?? person.isActive,
      },
      select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
    });
  }

  /** A platform role may hold platform permissions and nothing else. */
  private onlyPlatform(permissions: string[]): string[] {
    const allowed = new Set<string>(PLATFORM_PERMISSIONS);
    return [...new Set(permissions)].filter((one) => allowed.has(one));
  }

  private async refuseLockout(key: string, next: string[], actorId: string) {
    if (next.includes(PERMISSIONS.PLATFORM_STAFF_MANAGE)) return;

    const me = await this.db.platformUser.findUnique({ where: { id: actorId } });
    if (me?.role === key) {
      throw new BadRequestException(
        'You are on this role. Taking staff management off it would lock you out',
      );
    }

    // Anybody else still able to do it?
    const others = await this.db.platformUser.findMany({
      where: { isActive: true, role: { not: key } },
      select: { role: true },
    });
    for (const other of others) {
      const held = await this.permissionsFor(other.role);
      if (held.includes(PERMISSIONS.PLATFORM_STAFF_MANAGE)) return;
    }

    throw new BadRequestException('That would leave nobody able to manage staff');
  }

  /** Would anybody still be able to manage staff once this change lands? */
  private async refuseNobodyLeft(after: { id: string; role: string; isActive: boolean }) {
    const active = await this.db.platformUser.findMany({
      where: { isActive: true },
      select: { id: true, role: true },
    });

    const then = active
      .filter((one) => one.id !== after.id)
      .concat(after.isActive ? [{ id: after.id, role: after.role }] : []);

    for (const one of then) {
      const held = await this.permissionsFor(one.role);
      if (held.includes(PERMISSIONS.PLATFORM_STAFF_MANAGE)) return;
    }

    throw new BadRequestException('That would leave nobody able to manage staff');
  }
}
