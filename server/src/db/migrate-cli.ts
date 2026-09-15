import { config } from '../config.js';
import { logger } from '../logger.js';
import { runMigrations } from './migrate.js';
import { pool } from './pool.js';

function collectCodes(err: unknown, seen = new Set<unknown>()): string[] {
  if (typeof err !== 'object' || err === null || seen.has(err)) {
    return [];
  }
  seen.add(err);

  const codes: string[] = [];
  const { code, errors } = err as { code?: unknown; errors?: unknown };

  if (typeof code === 'string') {
    codes.push(code);
  }
  if (Array.isArray(errors)) {
    for (const nested of errors) {
      codes.push(...collectCodes(nested, seen));
    }
  }
  return codes;
}

function describeTarget(): string {
  try {
    const { hostname, port } = new URL(config.databaseUrl);
    return `${hostname}:${port === '' ? '5432' : port}`;
  } catch {
    return 'the host in DATABASE_URL';
  }
}

function explain(err: unknown): string {
  const codes = collectCodes(err);

  if (codes.includes('ECONNREFUSED')) {
    return `nothing is listening on ${describeTarget()} — start the database with: docker start ips-postgres`;
  }
  if (codes.includes('28P01')) {
    return 'PostgreSQL rejected the credentials in DATABASE_URL';
  }
  if (codes.includes('3D000')) {
    return 'the database named in DATABASE_URL does not exist';
  }
  return 'check DATABASE_URL and that PostgreSQL is running';
}

runMigrations()
  .then(() => {
    logger.info('migrations up to date');
  })
  .catch((err: unknown) => {
    logger.error({ err }, `migration run failed: ${explain(err)}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
