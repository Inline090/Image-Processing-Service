import { Pool } from 'pg';
import { config } from '../config.js';
import { logger } from '../logger.js';

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  logger.error({ err }, 'unexpected error on idle postgres client');
});
