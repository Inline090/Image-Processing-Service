import { config } from '../config.js';

// Both sign-in paths hand the client a token in the fragment, which its existing handler reads.
export function clientRedirect(fragment: string): string {
  return `${config.clientUrl}/#${fragment}`;
}

export function signInFailed(message: string): string {
  return clientRedirect(`error=${encodeURIComponent(message)}`);
}
