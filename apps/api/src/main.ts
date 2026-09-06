import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { resolveCorsOrigin } from './cors.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.enableCors({ origin: resolveCorsOrigin(), credentials: true });
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  console.log(`API listening on 0.0.0.0:${port}`);
}

try {
  await bootstrap();
} catch (error) {
  // A misconfigured deploy dies here. Print the reason plainly — a stack trace
  // scrolled past the platform's log window is what made this hard to spot.
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
