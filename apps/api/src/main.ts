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

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  console.log(`API listening on 0.0.0.0:${port}`);
}

await bootstrap();
