import { Module } from '@nestjs/common';
import { ConfigurationController } from './config.controller';
import { ConfigurationService } from './config.service';

@Module({
  controllers: [ConfigurationController],
  providers: [ConfigurationService],
  exports: [ConfigurationService],
})
export class ConfigurationModule {}
