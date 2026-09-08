import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { PERMISSIONS } from '@decor/shared';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';
import { NotificationQueryDto, NotificationSettingDto } from './dto/notification.dto';

/**
 * What happened while you were not looking.
 *
 * Everything here is about the caller's own notifications, so nothing carries a
 * permission — there is no way to read anybody else's. The wording, which is a
 * shop-wide setting, is a different matter and is gated like the rest of the
 * configuration.
 */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  mine(@CurrentUser() user: AuthUser, @Query() query: NotificationQueryDto) {
    return this.notifications.mine(user.id, query);
  }

  /** Just the number, for the bell. */
  @Get('unread')
  async unread(@CurrentUser() user: AuthUser) {
    return { unread: await this.notifications.unread(user.id) };
  }

  @Post('read-all')
  readAll(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user.id);
  }

  @Post(':id/read')
  read(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notifications.markRead(user.id, id);
  }

  /** Every trigger the product has, with this shop's wording where they set it. */
  @RequirePermissions(PERMISSIONS.CONFIG_VIEW)
  @Get('settings/all')
  settings() {
    return this.notifications.settings();
  }

  @RequirePermissions(PERMISSIONS.CONFIG_MANAGE)
  @Put('settings/:key')
  saveSetting(@Param('key') key: string, @Body() dto: NotificationSettingDto) {
    return this.notifications.saveSetting(key, dto);
  }
}
