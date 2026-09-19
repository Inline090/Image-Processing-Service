import { config } from '../config.js';

export const PROVIDERS = ['google', 'facebook', 'twitter'] as const;

export type OAuthProvider = (typeof PROVIDERS)[number];

/** Named as the strategies expect them, so each setup can be handed straight over. */
export type ProviderSetup = {
  clientID: string;
  clientSecret: string;
  callbackURL: string;
  scope: string[];
};

function credentialsFor(provider: OAuthProvider): { clientID: string; clientSecret: string } {
  switch (provider) {
    case 'google':
      return { clientID: config.googleClientId, clientSecret: config.googleClientSecret };
    case 'facebook':
      return { clientID: config.facebookAppId, clientSecret: config.facebookAppSecret };
    case 'twitter':
      return { clientID: config.twitterClientId, clientSecret: config.twitterClientSecret };
  }
}

// Only the providers that actually hold an address are asked for one. Twitter, and so
// X, return no address at all: asking for the email scope on a basic app can make the
// whole authorization fail, and the account is better off with a placeholder.
const SCOPES: Record<OAuthProvider, string[]> = {
  google: ['profile', 'email'],
  facebook: ['email'],
  twitter: ['users.read'],
};

export function isProviderEnabled(provider: OAuthProvider): boolean {
  const { clientID, clientSecret } = credentialsFor(provider);

  return clientID !== '' && clientSecret !== '';
}

export function providerSetup(provider: OAuthProvider): ProviderSetup {
  return {
    ...credentialsFor(provider),
    // Every callback is built from one base, so the addresses registered with the
    // three providers cannot drift out of step with the code.
    callbackURL: `${config.oauthCallbackBase}/${provider}/callback`,
    scope: SCOPES[provider],
  };
}
