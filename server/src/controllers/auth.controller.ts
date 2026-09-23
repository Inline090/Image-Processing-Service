import type { Request, Response } from 'express';
import { config } from '../config.js';
import type { UserRow } from '../db/types.js';
import { logger } from '../logger.js';
import { AppError } from '../middleware/error.js';
import { findOrCreateUserByEmail, findUserById } from '../repositories/users.js';
import { clientRedirect, signInFailed } from '../services/clientRedirect.js';
import { loginEmail, notifyAddress, sendEmail } from '../services/email.js';
import { consumeLoginToken, createLoginToken, sentRecently } from '../services/loginLink.js';
import { signToken } from '../utils/jwt.js';

// One link per address per minute, so a mail box cannot be flooded through our endpoint.
const RESEND_COOLDOWN_SECONDS = 60;

function serializeUser(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.created_at,
    avatarUrl: user.avatar_url,
  };
}

function normalizeEmail(value: unknown): string {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';

  // Loose on purpose: the link is the proof of the address, not the shape of it.
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : '';
}

function verifyUrl(token: string): string {
  return `${config.oauthCallbackBase}/email/verify?token=${encodeURIComponent(token)}`;
}

export async function startEmailSignIn(req: Request, res: Response): Promise<void> {
  const email = normalizeEmail((req.body as { email?: unknown }).email);

  if (email === '') {
    throw new AppError('Enter a valid email address', 400);
  }

  if (await sentRecently(email, RESEND_COOLDOWN_SECONDS)) {
    res.json({ sent: true });
    return;
  }

  const token = await createLoginToken(email);
  const url = verifyUrl(token);

  // Addresses that cannot receive mail, and a server with no mail key, get the link back so the
  // flow can still be completed locally. Everything else is emailed and never echoed here.
  if (notifyAddress(email) === null || config.resendApiKey === '') {
    logger.warn({ email }, 'sign in link returned rather than emailed');
    res.json({ sent: true, signInUrl: url });
    return;
  }

  try {
    const content = loginEmail(url, config.loginTokenMinutes);
    await sendEmail({ to: email, subject: content.subject, html: content.html });
  } catch (err) {
    logger.error({ err }, 'could not send the sign in email');
    throw new AppError('Could not send the sign in email. Please try again.', 502);
  }

  res.json({ sent: true });
}

// The link lands here from the mail client, so this answers with a redirect rather than JSON.
export async function verifyEmailSignIn(req: Request, res: Response): Promise<void> {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  const email = token === '' ? null : await consumeLoginToken(token);

  if (email === null) {
    res.redirect(signInFailed('That sign in link has expired or has already been used.'));
    return;
  }

  const user = await findOrCreateUserByEmail(email);
  const sessionToken = signToken({ sub: user.id, email: user.email });

  res.redirect(clientRedirect(`token=${encodeURIComponent(sessionToken)}`));
}

export async function me(req: Request, res: Response): Promise<void> {
  const authUser = req.user;
  if (authUser === undefined) {
    throw new AppError('Not authenticated', 401);
  }

  const user = await findUserById(authUser.sub);
  if (user === null) {
    throw new AppError('User no longer exists', 404);
  }

  res.json({ user: serializeUser(user) });
}
