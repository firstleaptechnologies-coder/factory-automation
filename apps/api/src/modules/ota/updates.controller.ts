import { Controller, Get, Header, Param, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { OtaService } from './ota.service';

/**
 * What the app asks on launch.
 *
 * Open, and deliberately so: the phone asking has not signed in yet — it may
 * not even have an account on it — and what it gets back is the same code the
 * stores hand out, signed so it cannot be tampered with in between. Nothing
 * here reads or returns a shop's data.
 */
@Controller()
export class UpdatesController {
  constructor(private readonly ota: OtaService) {}

  @Public()
  @Get('updates/manifest')
  async manifest(@Req() request: Request, @Res() response: Response): Promise<void> {
    const result = await this.ota.manifest({
      platform: header(request, 'expo-platform') ?? String(request.query.platform ?? ''),
      runtimeVersion: header(request, 'expo-runtime-version') ?? undefined,
      channel: header(request, 'expo-channel-name') ?? undefined,
      extraParams: header(request, 'expo-extra-params'),
      currentUpdateId: header(request, 'expo-current-update-id'),
      baseUrl: baseUrl(request),
    });

    response.status(result.status);
    for (const [name, value] of Object.entries(result.headers)) response.setHeader(name, value);
    response.send(result.body);
  }

  @Public()
  @Get('updates/assets/:id')
  async asset(@Param('id') id: string, @Res() response: Response): Promise<void> {
    const asset = await this.ota.asset(id);
    response.setHeader('content-type', asset.contentType);
    // Assets are addressed by a hash of their contents, so they never change.
    response.setHeader('cache-control', 'public, max-age=31536000, immutable');
    response.send(asset.body);
  }

  /**
   * Is this binary still good?
   *
   * Asked separately from the manifest because the answer is different in kind:
   * an update tells the app what to run, this tells it to go to the store.
   */
  @Public()
  @Get('app/version-check')
  @Header('cache-control', 'no-store')
  versionCheck(@Query('platform') platform?: string, @Query('channel') channel?: string) {
    return this.ota.versionCheck(platform, channel || 'production');
  }
}

function header(request: Request, name: string): string | null {
  const value = request.headers[name];
  return typeof value === 'string' ? value : null;
}

/**
 * Where assets should be fetched from.
 *
 * Configured where it is known, because a proxy in front of the API means the
 * host the request arrived on is not always the host a phone can reach.
 */
function baseUrl(request: Request): string {
  const configured = process.env.PUBLIC_API_URL;
  if (configured) return configured;
  const protocol = (request.headers['x-forwarded-proto'] as string) ?? request.protocol;
  return `${protocol}://${request.get('host')}`;
}
