import { Pool } from 'pg';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { sslOptionFor } from './ssl.js';

// One pool per process. On Lambda keep it at one and let the database pool.
export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: sslOptionFor(config.databaseUrl),
  max: config.poolMax,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  logger.error({ err }, 'unexpected error on idle postgres client');
});
