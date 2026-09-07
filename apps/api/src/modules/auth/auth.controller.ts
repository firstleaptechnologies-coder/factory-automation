import { Body, Controller, Get, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, LookupWorkspaceDto, PlatformLoginDto } from './dto/login.dto';
import { Public } from '../../common/decorators/public.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('workspace')
  lookup(@Body() dto: LookupWorkspaceDto) {
    return this.auth.lookupWorkspace(dto.workspace);
  }

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @Post('platform/login')
  platformLogin(@Body() dto: PlatformLoginDto) {
    return this.auth.platformLogin(dto);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}
