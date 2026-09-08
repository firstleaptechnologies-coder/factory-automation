import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto, LookupWorkspaceDto, PlatformLoginDto } from './dto/login.dto';
import { Public } from '../../common/decorators/public.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';

/**
 * How many times one address may try to get in each minute.
 *
 * Generous for a shop where ten people sign in at nine o'clock from one
 * connection, mean for anything working through a password list. Counted in
 * this process's memory, so several API instances would each allow this many —
 * enough while there is one, and the reason a signed-in lockout on the account
 * itself is still worth having later.
 */
export const SIGN_IN_ATTEMPTS_PER_MINUTE = 30;

const throttleSignIn = () =>
  Throttle({ default: { limit: SIGN_IN_ATTEMPTS_PER_MINUTE, ttl: 60_000 } });

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @throttleSignIn()
  @Post('workspace')
  lookup(@Body() dto: LookupWorkspaceDto) {
    return this.auth.lookupWorkspace(dto.workspace);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @throttleSignIn()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @throttleSignIn()
  @Post('platform/login')
  platformLogin(@Body() dto: PlatformLoginDto) {
    return this.auth.platformLogin(dto);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user as never);
  }
}
