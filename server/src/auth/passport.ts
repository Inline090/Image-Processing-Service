import {
  Strategy as TwitterStrategy,
  type Profile as TwitterProfile,
} from '@superfaceai/passport-twitter-oauth2';
import passport from 'passport';
import { Strategy as FacebookStrategy, type Profile as FacebookProfile } from 'passport-facebook';
import { Strategy as GoogleStrategy, type Profile as GoogleProfile } from 'passport-google-oauth20';
import type {
  Metadata,
  StateStore,
  StateStoreStoreCallback,
  StateStoreVerifyCallback,
  VerifyCallback,
} from 'passport-oauth2';
import { resolveOAuthUser } from '../services/oauth.js';
import { isProviderEnabled, providerSetup, type OAuthProvider } from './providers.js';
import { isStateValid } from './state.js';

/**
 * A state that needs no memory. Passport's own store keeps it in a session, which this
 * api does not have; this one is signed, so the callback can check it on its own.
 *
 * Two things here are load-bearing. The library decides how to call these by reading
 * their arity, and it calls them with the callback last either way, so the callback is
 * whichever argument was actually passed. The later parameter is optional for the
 * types, which allow two shapes each, and it still counts towards the arity, which is
 * what puts the library on the branch where the callback comes last. A test pins both
 * the arity and the two positions, and the callback route exercises it for real.
 */
const statelessState: StateStore = {
  store(
    _req,
    metaOrCallback: Metadata | StateStoreStoreCallback,
    callback?: StateStoreStoreCallback,
  ) {
    const done = callback ?? metaOrCallback;

    if (typeof done === 'function') {
      done(null, undefined);
    }
  },
  verify(
    _req,
    state,
    metaOrCallback: Metadata | StateStoreVerifyCallback,
    callback?: StateStoreVerifyCallback,
  ) {
    const done = callback ?? metaOrCallback;

    if (typeof done === 'function') {
      done(null, isStateValid(state), undefined);
    }
  },
};

// All three providers end the same way, so the work is done once and handed over.
async function completeSignIn(
  provider: OAuthProvider,
  providerId: string,
  email: string | null,
  done: VerifyCallback,
): Promise<void> {
  try {
    const user = await resolveOAuthUser({ provider, providerId, email });

    // Passport types the signed-in value as Express.User, which is the shape the
    // bearer-token middleware puts on a request. What this actually carries is a row
    // from the users table, so it crosses that boundary once here and is read back as a
    // row by the callback route.
    done(null, user as unknown as Express.User);
  } catch (err) {
    done(err instanceof Error ? err : new Error(String(err)));
  }
}

/**
 * Registers a strategy for each provider that has credentials. One without them is
 * simply absent, and its route says so rather than sending the browser somewhere that
 * cannot work.
 */
export function configurePassport(): void {
  if (isProviderEnabled('google')) {
    passport.use(
      new GoogleStrategy(
        { ...providerSetup('google'), store: statelessState },
        (_accessToken: string, _refreshToken: string, profile: GoogleProfile, done) => {
          void completeSignIn('google', profile.id, profile.emails?.[0]?.value ?? null, done);
        },
      ),
    );
  }

  if (isProviderEnabled('facebook')) {
    passport.use(
      new FacebookStrategy(
        { ...providerSetup('facebook'), store: statelessState },
        (
          _accessToken: string,
          _refreshToken: string,
          profile: FacebookProfile,
          done: VerifyCallback,
        ) => {
          void completeSignIn('facebook', profile.id, profile.emails?.[0]?.value ?? null, done);
        },
      ),
    );
  }

  if (isProviderEnabled('twitter')) {
    passport.use(
      new TwitterStrategy(
        {
          ...providerSetup('twitter'),
          // A server-side app, which is what this is: the secret stays here.
          clientType: 'confidential',
          store: statelessState,
        },
        (
          _accessToken: string,
          _refreshToken: string,
          profile: TwitterProfile,
          done: VerifyCallback,
        ) => {
          // Twitter returns no address at all, so the account is identified by its id.
          void completeSignIn('twitter', profile.id, null, done);
        },
      ),
    );
  }
}

export { statelessState };
