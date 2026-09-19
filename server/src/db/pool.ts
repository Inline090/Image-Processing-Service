import { Pool } from 'pg';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { sslOptionFor } from './ssl.js';

export const pool = new Pool({
  connectionString: config.databaseUrl,
  // A hosted database asks for an encrypted connection, and the driver would read
  // `require` in the url as "check the certificate too" - see sslOptionFor.
  ssl: sslOptionFor(config.databaseUrl),
  // One process reuses this pool for its whole life. On a long-lived host that is a
  // handful of connections; on Lambda every concurrent invocation is its own process,
  // so the pool stays at one and the database's own pooler does the multiplexing.
  max: config.poolMax,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  logger.error({ err }, 'unexpected error on idle postgres client');
});
