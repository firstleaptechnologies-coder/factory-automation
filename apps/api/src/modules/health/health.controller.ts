import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Public } from '../../common/decorators/public.decorator';

/** Which deployment this is, for anyone looking at it from outside. */
export const APP_ENV = () => process.env.APP_ENV ?? 'development';

/**
 * Is this instance alive, and which one is it?
 *
 * Load balancers need an answer that does not require a token, and so does
 * anyone about to ask "am I looking at staging or at the shop's live data" —
 * a question that gets answered wrongly exactly once before it matters.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check(): Promise<Record<string, unknown>> {
    const started = Date.now();
    let database = 'ok';
    try {
      await this.prisma.platform.$queryRaw`SELECT 1`;
    } catch {
      // Reported rather than thrown: "the API is up and the database is not"
      // is the single most useful thing this endpoint can say.
      database = 'unreachable';
    }

    return {
      status: database === 'ok' ? 'ok' : 'degraded',
      env: APP_ENV(),
      version: process.env.APP_VERSION ?? null,
      commit: process.env.APP_COMMIT ?? null,
      uptimeSeconds: Math.round(process.uptime()),
      database,
      checkedInMs: Date.now() - started,
    };
  }
}
