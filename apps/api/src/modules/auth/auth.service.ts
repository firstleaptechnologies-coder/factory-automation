import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantRegistryService } from '../../common/tenancy/tenant-registry.service';
import { runInTenant, runAsPlatform } from '../../common/tenancy/tenant-context';
import { LoginDto, PlatformLoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly tenants: TenantRegistryService,
  ) {}

  static hash(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  /**
   * Sign in to one workspace.
   *
   * The tenant is resolved first, then the user is looked up inside it. Doing
   * it in that order means a wrong workspace can never match a user from
   * another one, however common the employee code.
   */
  async login(dto: LoginDto) {
    const tenant = await this.tenants.bySlugOrThrow(dto.workspace.trim());

    const user = await runInTenant(tenant, () =>
      this.prisma.user.findFirst({
        where: {
          isActive: true,
          OR: [
            { code: dto.identifier.trim().toUpperCase() },
            { email: dto.identifier.trim().toLowerCase() },
            { phone: dto.identifier.trim() },
          ],
        },
        include: { roleRef: true },
      }),
    );

    // One message for a bad code and a bad password: telling them which was
    // wrong tells an attacker which codes exist.
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Wrong workspace, code or password');
    }

    const permissions = user.roleRef?.permissions ?? [];

    return {
      accessToken: await this.jwt.signAsync({
        sub: user.id,
        tenantId: tenant.tenantId,
        code: user.code,
        role: user.role,
        permissions,
      }),
      user: {
        id: user.id,
        code: user.code,
        name: user.name,
        role: user.role,
        roleName: user.roleRef?.name ?? user.role,
        permissions,
      },
      workspace: { slug: tenant.slug, tenantId: tenant.tenantId },
    };
  }

  /** Sign in to the platform itself, above every tenant. */
  async platformLogin(dto: PlatformLoginDto) {
    const admin = await runAsPlatform(() =>
      this.prisma.platform.platformUser.findUnique({
        where: { email: dto.email.trim().toLowerCase() },
      }),
    );

    if (!admin || !admin.isActive || !(await bcrypt.compare(dto.password, admin.passwordHash))) {
      throw new UnauthorizedException('Wrong email or password');
    }

    return {
      accessToken: await this.jwt.signAsync({
        sub: admin.id,
        isPlatform: true,
        // Carried so a change made while helping a shop is signed with a name
        // in their own audit trail, not with an id from another database.
        name: admin.name,
        permissions: ['platform.tenant.view', 'platform.tenant.manage'],
      }),
      user: { id: admin.id, name: admin.name, email: admin.email, isPlatform: true },
    };
  }

  /** Does this workspace exist? Used by the app before asking for a password. */
  /**
   * The signed-in user, hydrated from the database.
   *
   * The token deliberately carries only an id, the role and the permissions —
   * enough to authorise a request. The display name is read fresh here instead,
   * so renaming somebody shows up straight away rather than on their next
   * sign-in, and the token stays small.
   */
  async me(identity: {
    id: string;
    code?: string;
    role?: string;
    permissions?: string[];
    isPlatform?: boolean;
    tenant?: unknown;
  }) {
    if (identity.isPlatform) {
      const admin = await this.prisma.platform.platformUser.findUnique({
        where: { id: identity.id },
        select: { id: true, name: true, email: true },
      });
      return { ...identity, name: admin?.name, email: admin?.email };
    }

    const user = await this.prisma.user.findFirst({
      where: { id: identity.id },
      select: { id: true, code: true, name: true, role: true, roleRef: { select: { name: true } } },
    });

    return {
      ...identity,
      name: user?.name,
      code: user?.code ?? identity.code,
      roleName: user?.roleRef?.name ?? user?.role ?? identity.role,
    };
  }

  async lookupWorkspace(slug: string) {
    const tenant = await this.tenants.bySlugOrThrow(slug.trim());
    return { slug: tenant.slug, exists: true };
  }
}
