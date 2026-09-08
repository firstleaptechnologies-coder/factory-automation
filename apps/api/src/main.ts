import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { currentRole, runsScheduledWork } from './common/jobs/role';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);

  // Said out loud, because the difference between the two is invisible
  // otherwise: an api process that was meant to be the worker looks perfectly
  // healthy right up until somebody asks why last night's reconcile never ran.
  const role = currentRole();
  // eslint-disable-next-line no-console
  console.log(
    `Decor Bucket API listening on http://localhost:${port}/api ` +
      `— role "${role}", scheduled work ${runsScheduledWork(role) ? 'armed' : 'off'}`,
  );
}

void bootstrap();
