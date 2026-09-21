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

// The state is signed, so no session store is needed.
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

function photoOf(profile: { photos?: { value?: string }[] | undefined }): string | null {
  return profile.photos?.[0]?.value ?? null;
}

async function completeSignIn(
  provider: OAuthProvider,
  providerId: string,
  email: string | null,
  avatarUrl: string | null,
  done: VerifyCallback,
): Promise<void> {
  try {
    const user = await resolveOAuthUser({ provider, providerId, email, avatarUrl });

    done(null, user as unknown as Express.User);
  } catch (err) {
    done(err instanceof Error ? err : new Error(String(err)));
  }
}

export function configurePassport(): void {
  if (isProviderEnabled('google')) {
    passport.use(
      new GoogleStrategy(
        { ...providerSetup('google'), store: statelessState },
        (_accessToken: string, _refreshToken: string, profile: GoogleProfile, done) => {
          void completeSignIn(
            'google',
            profile.id,
            profile.emails?.[0]?.value ?? null,
            photoOf(profile),
            done,
          );
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
          void completeSignIn(
            'facebook',
            profile.id,
            profile.emails?.[0]?.value ?? null,
            photoOf(profile),
            done,
          );
        },
      ),
    );
  }

  if (isProviderEnabled('twitter')) {
    passport.use(
      new TwitterStrategy(
        {
          ...providerSetup('twitter'),
          clientType: 'confidential',
          store: statelessState,
        },
        (
          _accessToken: string,
          _refreshToken: string,
          profile: TwitterProfile,
          done: VerifyCallback,
        ) => {
          void completeSignIn('twitter', profile.id, null, photoOf(profile), done);
        },
      ),
    );
  }
}

export { statelessState };
