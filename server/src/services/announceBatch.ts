import { config } from '../config.js';
import { logger } from '../logger.js';
import { MAX_RECEIVE_COUNT } from '../queue/sqs.js';
import { batchEmail, notifyAddress, sendEmail } from './email.js';
import {
  claimBatchAnnouncement,
  countOutstandingInBatch,
  findJobBatch,
  findJobsByBatchForUser,
} from '../repositories/jobs.js';
import { findUserById } from '../repositories/users.js';

// Emails a batch once, and never fails the job it is reporting on.
export async function announceBatchIfSettled(jobId: string): Promise<void> {
  try {
    const job = await findJobBatch(jobId);

    if (job === null) {
      return;
    }

    if ((await countOutstandingInBatch(job.batchId, MAX_RECEIVE_COUNT)) > 0) {
      return;
    }

    if (!(await claimBatchAnnouncement(job.batchId))) {
      return;
    }

    const user = await findUserById(job.userId);

    if (user === null) {
      return;
    }

    const address = notifyAddress(user.email);

    if (address === null) {
      logger.info({ batchId: job.batchId }, 'nothing to send - the account has no address');
      return;
    }

    const jobs = await findJobsByBatchForUser(job.batchId, job.userId);
    const ready = jobs.filter((each) => each.status === 'ready').length;
    const failed = jobs.filter((each) => each.status === 'failed').length;

    await sendEmail({
      to: address,
      ...batchEmail({ total: jobs.length, ready, failed }, `${config.clientUrl}/history`),
    });

    logger.info({ batchId: job.batchId, ready, failed }, 'batch notification sent');
  } catch (err) {
    logger.error({ err, jobId }, 'could not send the batch notification');
  }
}
