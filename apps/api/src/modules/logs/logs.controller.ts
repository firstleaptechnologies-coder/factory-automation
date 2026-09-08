import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { LogsService } from './logs.service';
import { ClientLogBatchDto } from './dto/log.dto';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';

/**
 * Where the clients send what they saw.
 *
 * Behind the ordinary token — an anonymous endpoint accepting arbitrary text is
 * a free place to write into somebody else's database — and rate-limited,
 * because a client stuck in a crash loop should not be able to fill the table
 * while it is at it.
 */
@Controller('logs')
export class LogsController {
  constructor(private readonly logs: LogsService) {}

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post()
  record(@Body() batch: ClientLogBatchDto, @CurrentUser() user: AuthUser) {
    return this.logs.record(batch, user?.id);
  }
}
