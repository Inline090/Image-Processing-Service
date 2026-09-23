import { config } from '../config.js';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

const UNREACHABLE_SUFFIX = '.local';

export class EmailSendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailSendError';
  }
}

// Invented addresses end in .local, so nothing is ever sent to one.
export function notifyAddress(email: string): string | null {
  return email.endsWith(UNREACHABLE_SUFFIX) ? null : email;
}

export type BatchCounts = {
  total: number;
  ready: number;
  failed: number;
};

export type EmailContent = {
  subject: string;
  html: string;
};

const SUBJECT = 'Your batch processing is complete';

function bodyFor(counts: BatchCounts): string {
  if (counts.failed > 0) {
    return `${counts.ready} of ${counts.total} images in your batch finished transforming and are ready. ${counts.failed} could not be processed.`;
  }

  if (counts.total === 1) {
    return 'The image in your batch has successfully finished transforming. It has been processed according to your specifications and is now ready.';
  }

  return `All ${counts.total} images in your batch have successfully finished transforming. The files have been processed according to your specifications and are now ready.`;
}

// Links to the app, because a signed url expires long before an inbox is read.
export function batchEmail(counts: BatchCounts, historyUrl: string): EmailContent {
  const html = [
    '<p>Hello,</p>',
    `<p>${bodyFor(counts)}</p>`,
    '<p>Please visit your history dashboard to review and download the completed assets:</p>',
    `<p><a href="${historyUrl}">Open History Dashboard</a></p>`,
    '<p>Thank you,<br />The Lumina Team</p>',
  ].join('');

  return { subject: SUBJECT, html };
}

// Sent on request only, so it says what to do and what to do if it was not you.
export function loginEmail(signInUrl: string, minutes: number): EmailContent {
  const html = [
    '<p>Hello,</p>',
    `<p>Click the link below to sign in to Lumina. It works once and expires in ${minutes} minutes.</p>`,
    `<p><a href="${signInUrl}">Sign in to Lumina</a></p>`,
    '<p>If you did not ask to sign in, you can ignore this email.</p>',
    '<p>Thank you,<br />The Lumina Team</p>',
  ].join('');

  return { subject: 'Sign in to Lumina', html };
}

type Email = {
  to: string;
  subject: string;
  html: string;
};

export async function sendEmail(email: Email): Promise<void> {
  if (config.resendApiKey === '') {
    throw new EmailSendError('RESEND_API_KEY is not set');
  }

  let response: Response;

  try {
    response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: config.emailFrom,
        to: email.to,
        subject: email.subject,
        html: email.html,
      }),
    });
  } catch {
    throw new EmailSendError('the email service could not be reached');
  }

  if (!response.ok) {
    throw new EmailSendError(
      `the email service refused the send (${response.status})${await refusal(response)}`,
    );
  }
}

async function refusal(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
  const message = body?.message;

  return typeof message === 'string' ? `: ${message.slice(0, 200)}` : '';
}
