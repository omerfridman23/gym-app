/**
 * Startup check for the environment variables the API cannot run without.
 *
 * Without this, a missing variable surfaces as a `getOrThrow` deep inside
 * module initialization — the process dies before the HTTP server binds, the
 * platform healthcheck fails, and the deploy is marked failed with nothing in
 * the logs to say which variable was missing. That failure mode kept a broken
 * deploy invisible for a week. Reporting every missing name at once, up front,
 * turns it into a one-line fix.
 */

export interface RequiredVar {
  key: string;
  why: string;
  /** Only required when NODE_ENV=production. */
  productionOnly?: boolean;
}

export const REQUIRED_ENV: RequiredVar[] = [
  {
    key: 'DATABASE_URL',
    why: 'pooled Postgres connection for coach-scoped queries (RLS-enforced role)',
  },
  {
    key: 'DATABASE_URL_UNPOOLED',
    why: 'direct Postgres connection for the public confirm/pay links and the reminders worker',
  },
  {
    key: 'JWT_SECRET',
    why: 'signing key for the session cookie',
  },
  {
    key: 'WEB_ORIGIN',
    why: 'allowed browser origin, and the origin embedded in client-facing links',
    productionOnly: true,
  },
];

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || String(value).trim() === '';
}

export function findMissingEnv(
  config: Record<string, unknown>,
  required: RequiredVar[] = REQUIRED_ENV,
): RequiredVar[] {
  const production = config.NODE_ENV === 'production';
  return required.filter(
    (variable) =>
      (production || !variable.productionOnly) && isBlank(config[variable.key]),
  );
}

export function formatMissingEnv(missing: RequiredVar[]): string {
  const lines = missing.map(
    (variable) => `  - ${variable.key}: ${variable.why}`,
  );
  return [
    `Cannot start: ${missing.length} required environment variable(s) are missing.`,
    ...lines,
    'See .env.example. On Railway, set these in the service Variables tab.',
  ].join('\n');
}

/**
 * ConfigModule `validate` hook — runs after the env files are merged and
 * before any other module resolves, so it beats every `getOrThrow`.
 */
export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const missing = findMissingEnv(config);
  if (missing.length > 0) throw new Error(formatMissingEnv(missing));
  return config;
}
