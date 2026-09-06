import { Global, Module } from '@nestjs/common';
import { ImageOptimizerService } from './image-optimizer.service';

@Global()
@Module({
  providers: [ImageOptimizerService],
  exports: [ImageOptimizerService],
})
export class ImagesModule {}
