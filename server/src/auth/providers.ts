import { config } from '../config.js';

export const PROVIDERS = ['google', 'facebook', 'twitter'] as const;

export type OAuthProvider = (typeof PROVIDERS)[number];

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

const SCOPES: Record<OAuthProvider, string[]> = {
  google: ['profile', 'email'],
  facebook: ['email'],
  twitter: ['users.read'],
};

// A provider with no credentials is simply not registered.
export function isProviderEnabled(provider: OAuthProvider): boolean {
  const { clientID, clientSecret } = credentialsFor(provider);

  return clientID !== '' && clientSecret !== '';
}

export function providerSetup(provider: OAuthProvider): ProviderSetup {
  return {
    ...credentialsFor(provider),
    callbackURL: `${config.oauthCallbackBase}/${provider}/callback`,
    scope: SCOPES[provider],
  };
}
