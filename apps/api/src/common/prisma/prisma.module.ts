import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * PrismaService is constructed then wrapped, so every injection point receives
 * the tenant-aware proxy rather than the raw client.
 */
@Global()
@Module({
  providers: [
    {
      provide: PrismaService,
      useFactory: async () => {
        const service = new PrismaService();
        await service.onModuleInit();
        return PrismaService.wrap(service);
      },
    },
  ],
  exports: [PrismaService],
})
export class PrismaModule {}
