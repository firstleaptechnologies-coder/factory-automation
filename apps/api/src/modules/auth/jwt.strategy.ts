import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { TenantRegistryService } from '../../common/tenancy/tenant-registry.service';

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

    return {
      id: payload.sub,
      code: payload.code,
      role: payload.role,
      permissions: payload.permissions ?? [],
      tenant,
    };
  }
}
