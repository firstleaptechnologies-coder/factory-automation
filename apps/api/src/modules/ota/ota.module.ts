import { Module } from '@nestjs/common';
import { OtaService } from './ota.service';
import { ReleasesService } from './releases.service';
import { UpdatesController } from './updates.controller';
import { ReleasesController } from './releases.controller';

@Module({
  controllers: [UpdatesController, ReleasesController],
  providers: [OtaService, ReleasesService],
})
export class OtaModule {}
