import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/**
 * Global, because almost everything raises one.
 *
 * The alternative — importing this module into orders, payments, leads and
 * quotes — makes a cycle out of the first module that wants to tell somebody
 * about something that happened somewhere else.
 */
@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
