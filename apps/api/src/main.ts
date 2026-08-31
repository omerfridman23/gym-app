import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

const LOCALHOST_ORIGIN = /^http:\/\/localhost:\d+$/;

function resolveCorsOrigin(): string[] | RegExp {
  if (process.env.NODE_ENV !== 'production') {
    return LOCALHOST_ORIGIN;
  }

  return (process.env.WEB_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.enableCors({ origin: resolveCorsOrigin(), credentials: true });
  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}

await bootstrap();
