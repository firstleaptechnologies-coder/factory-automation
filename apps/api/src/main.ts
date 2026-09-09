import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { currentRole, runsScheduledWork } from './common/jobs/role';

async function bootstrap() {
  /*
   * `rawBody` keeps the exact bytes of each request alongside the parsed body.
   *
   * Razorpay signs what it sent, not what we can reconstruct from it: JSON
   * round-trips do not preserve key order or number formatting, so a signature
   * checked against a re-serialised body is a check that passes today and
   * fails the day their encoder changes — or, worse, one somebody works out
   * how to make pass. See RazorpayService.verifyWebhook.
   */
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.setGlobalPrefix('api');
  // Before the pipes: a validation error is an answer to the caller too.
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
      .split(',')
      .map((o) => o.trim()),
    credentials: true,
  });

  // Without this, Nest never hears SIGTERM, so a deploy severs whatever was
  // in flight: the platform stops the container, open requests die mid-answer,
  // and every Prisma pool — the platform one and each dedicated tenant's —
  // is dropped rather than closed. With it, the server stops accepting new
  // connections, finishes the ones it has, and runs onModuleDestroy, which is
  // where PrismaService disconnects the registry.
  //
  // Money rows survive either way: postings are keyed on
  // (tenantId, sourceType, sourceId), so a severed write cannot double when it
  // is retried. What this protects is the operator, who otherwise sees a
  // receipt fail for no reason they could have caused.
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);

  // Said out loud, because the difference between the two is invisible
  // otherwise: an api process that was meant to be the worker looks perfectly
  // healthy right up until somebody asks why last night's reconcile never ran.
  const role = currentRole();
  // eslint-disable-next-line no-console
  console.log(
    `FAS API listening on http://localhost:${port}/api ` +
      `— role "${role}", scheduled work ${runsScheduledWork(role) ? 'armed' : 'off'}`,
  );
}

void bootstrap();
