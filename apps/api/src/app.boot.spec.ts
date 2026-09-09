import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { PrismaService } from './common/prisma/prisma.service';

/**
 * Does the application actually start?
 *
 * Every other spec builds a service with `new`, handing it whatever it asks
 * for — which means a provider that is registered in one module and injected
 * in another passes every test in the suite and then fails at boot, in
 * production, with the process exiting before it serves a request. That is a
 * class of bug the unit tests cannot see by construction, and it has already
 * happened here once: the billing job needed the job runner, and the module
 * holding it did not import the module that provides it.
 *
 * Nothing is connected to. The Prisma client is replaced, because this asks
 * whether the graph resolves, not whether a database is running — a rail that
 * needs Postgres is a rail that gets skipped in CI.
 */
describe('the application', () => {
  it('resolves every dependency it declares', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: async () => undefined,
        $disconnect: async () => undefined,
        onModuleInit: async () => undefined,
        onModuleDestroy: async () => undefined,
        platform: {},
      })
      .compile();

    // Instantiating is the point: `compile` builds the graph, `init` runs the
    // constructors that discover a missing provider.
    const app = moduleRef.createNestApplication();
    await app.init();
    await app.close();
  });
});
