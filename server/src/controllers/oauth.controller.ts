import type { NextFunction, Request, Response } from 'express';
import passport from 'passport';
import { isProviderEnabled, type OAuthProvider } from '../auth/providers.js';
import { createState } from '../auth/state.js';
import { config } from '../config.js';
import type { UserRow } from '../db/types.js';
import { logger } from '../logger.js';
import { signToken } from '../utils/jwt.js';

// A person is watching this, so everything is reported back to the client as a
// fragment on its own address rather than as a page of json.
function clientRedirect(fragment: string): string {
  return `${config.clientUrl}/#${fragment}`;
}

function signInFailed(message: string): string {
  return clientRedirect(`error=${encodeURIComponent(message)}`);
}

/** Sends the browser to the provider. A page navigation, not a request. */
export function startProvider(provider: OAuthProvider) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!isProviderEnabled(provider)) {
      res.redirect(signInFailed(`${provider} sign-in is not set up on this server.`));
      return;
    }

    // A fresh signed state for every attempt: the strategy checks it on the way back,
    // and the store below does that from the signature alone.
    passport.authenticate(provider, { session: false, state: createState() })(req, res, next);
  };
}

/** Handles the provider's answer, and turns it into our own token. */
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
          // Also the path taken when the state does not check out, which is why the
          // wording covers both rather than blaming the provider.
          res.redirect(signInFailed('That sign-in could not be confirmed. Please try again.'));
          return;
        }

        // The strategy's own callback put a row from our users table here, which is a
        // different thing from the token payload Passport types this slot as.
        const account = user as unknown as UserRow;
        const token = signToken({ sub: account.id, email: account.email });

        // In the fragment, so the token stays out of server logs and out of anything the
        // browser sends along with the next request.
        res.redirect(clientRedirect(`token=${encodeURIComponent(token)}`));
      },
    )(req, res, next);
  };
}
