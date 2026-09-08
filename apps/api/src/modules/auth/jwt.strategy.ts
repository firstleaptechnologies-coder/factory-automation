import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { TenantRegistryService } from '../../common/tenancy/tenant-registry.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { runInTenant } from '../../common/tenancy/tenant-context';

export interface JwtPayload {
  sub: string;
  tenantId?: string;
  code?: string;
  role?: string;
  permissions?: string[];
  isPlatform?: boolean;
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
      return {
        id: payload.sub,
        isPlatform: true,
        permissions: payload.permissions ?? [],
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
        select: { role: true, roleRef: { select: { permissions: true } } },
      }),
    );
    if (!user) throw new UnauthorizedException('This account is no longer active');

    return {
      id: payload.sub,
      code: payload.code,
      role: user.role ?? payload.role,
      permissions: user.roleRef?.permissions ?? [],
      tenant,
    };
  }
}
