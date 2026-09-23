import type { NextFunction, Request, Response } from 'express';
import passport from 'passport';
import { isProviderEnabled, type OAuthProvider } from '../auth/providers.js';
import { createState } from '../auth/state.js';
import type { UserRow } from '../db/types.js';
import { logger } from '../logger.js';
import { clientRedirect, signInFailed } from '../services/clientRedirect.js';
import { signToken } from '../utils/jwt.js';

export function startProvider(provider: OAuthProvider) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!isProviderEnabled(provider)) {
      res.redirect(signInFailed(`${provider} sign-in is not set up on this server.`));
      return;
    }

    passport.authenticate(provider, { session: false, state: createState() })(req, res, next);
  };
}

export function finishProvider(provider: OAuthProvider) {
  return (req: Request, res: Response, next: NextFunction): void => {
    passport.authenticate(
      provider,
      { session: false },
      (err: unknown, user: Express.User | false | null) => {
        if (err !== null && err !== undefined) {
          logger.warn({ err, provider }, 'oauth sign-in failed');
          res.redirect(signInFailed(`Could not sign you in with ${provider}. Please try again.`));
          return;
        }

        if (user === false || user === null || user === undefined) {
          res.redirect(signInFailed('That sign-in could not be confirmed. Please try again.'));
          return;
        }

        const account = user as unknown as UserRow;
        const token = signToken({ sub: account.id, email: account.email });

        res.redirect(clientRedirect(`token=${encodeURIComponent(token)}`));
      },
    )(req, res, next);
  };
}
