import { logger } from '../logger.js';
import { pruneExpiredCache } from '../repositories/jobs.js';

// At most one prune an hour, so a burst of jobs does not run it once per message.
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;

let lastPrunedAt = 0;

export async function pruneCacheIfDue(): Promise<void> {
  if (Date.now() - lastPrunedAt < PRUNE_INTERVAL_MS) {
    return;
  }

  lastPrunedAt = Date.now();

  try {
    const removed = await pruneExpiredCache();

    if (removed > 0) {
      logger.info({ removed }, 'expired cache entries removed');
    }
  } catch (err) {
    // Housekeeping never fails a job that is being processed.
    logger.warn({ err }, 'could not prune expired cache entries');
  }
}
