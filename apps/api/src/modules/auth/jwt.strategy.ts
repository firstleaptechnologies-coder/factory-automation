import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { TenantRegistryService } from '../../common/tenancy/tenant-registry.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { platformPermissionsFor } from '@fas/shared';
import { runAsPlatform, runInTenant } from '../../common/tenancy/tenant-context';

export interface JwtPayload {
  sub: string;
  tenantId?: string;
  code?: string;
  name?: string;
  role?: string;
  permissions?: string[];
  isPlatform?: boolean;
  /**
   * Set when somebody from the platform is inside a workspace to help.
   *
   * The token is otherwise an ordinary tenant token — the permissions are the
   * account's own — so this is what makes it obvious in the audit trail, on the
   * screen, and in the log that it was not really them.
   */
  impersonatedBy?: { id: string; name: string };
}

/**
 * Turns a token into the request's identity *and* its tenant.
 *
 * The tenant is read from the signed token and then resolved against the
 * registry, so a caller cannot pick which business's data they see by editing a
 * header. A token whose tenant has since been suspended stops working here.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly tenants: TenantRegistryService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') ?? 'dev-only-change-in-production',
    });
  }

  async validate(payload: JwtPayload) {
    if (payload.isPlatform) {
      /*
       * What their job allows now, not what it allowed at sign-in — the same
       * argument as for a tenant's role below. Somebody moved off support
       * should stop being able to open workspaces immediately.
       */
      const admin = await runAsPlatform(() =>
        this.prisma.platform.platformUser.findUnique({
          where: { id: payload.sub },
          select: { name: true, role: true, isActive: true },
        }),
      );
      if (!admin?.isActive) throw new UnauthorizedException('This account is no longer active');

      /*
       * What the role holds now, the same way a tenant's role is read now.
       *
       * The platform roles are rows and are edited, so reading them from the
       * token would mean a colleague whose job changed this morning keeps
       * yesterday's powers until they sign in again. A role row that has gone
       * missing falls back to the shared definition — never to everything.
       */
      const stored = await runAsPlatform(() =>
        this.prisma.platform.platformRole.findUnique({
          where: { key: admin.role },
          select: { permissions: true },
        }),
      );

      return {
        id: payload.sub,
        name: admin.name,
        isPlatform: true,
        platformRole: admin.role,
        permissions: stored?.permissions ?? platformPermissionsFor(admin.role),
      };
    }

    if (!payload.tenantId) throw new UnauthorizedException('Token has no workspace');

    const tenant = await this.tenants.byIdOrThrow(payload.tenantId);

    /*
     * What the role allows now, not what it allowed at sign-in.
     *
     * The token was signed with a copy of the permissions, which made it a
     * stale answer to a live question in both directions: a permission added
     * in a release did not exist for anybody already signed in — they were
     * refused a screen their role plainly granted them, with nothing to do
     * about it but sign out — and one taken away kept working until their
     * token happened to expire. It is one indexed read, and it also means a
     * person switched off stops being able to work immediately.
     */
    const user = await runInTenant(tenant, () =>
      this.prisma.user.findFirst({
        where: { id: payload.sub, isActive: true },
        select: { name: true, role: true, roleRef: { select: { permissions: true } } },
      }),
    );
    if (!user) throw new UnauthorizedException('This account is no longer active');

    return {
      id: payload.sub,
      code: payload.code,
      // Carried through so the trail, the log and the screen all say that
      // somebody from the platform was the one doing this.
      impersonatedBy: payload.impersonatedBy,
      // Read here rather than carried in the token, so a person who changes
      // their name is named correctly in what they do next.
      name: user.name,
      role: user.role ?? payload.role,
      permissions: user.roleRef?.permissions ?? [],
      tenant,
    };
  }
}
