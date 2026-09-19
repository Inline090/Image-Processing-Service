import type { OAuthProvider } from '../auth/providers.js';
import type { UserRow } from '../db/types.js';
import { findAccount, linkAccount } from '../repositories/oauthAccounts.js';
import {
  createUser,
  DuplicateEmailError,
  findUserByEmail,
  findUserById,
} from '../repositories/users.js';

export type OAuthProfile = {
  provider: OAuthProvider;
  /** The provider's own id for the account. It cannot be renamed, which a username can. */
  providerId: string;
  /** Whatever the provider was willing to share. Twitter shares nothing. */
  email: string | null;
};

/**
 * The account needs a unique address, and not every provider hands one over, so a
 * placeholder is built from the provider and its id. Nothing in this app sends mail,
 * so it is only ever a label.
 */
export function accountEmail(profile: OAuthProfile): string {
  return profile.email ?? `${profile.provider}-${profile.providerId}@${profile.provider}.local`;
}

/**
 * Finds the account behind a provider sign-in, making one if this is the first time.
 *
 * The order matters: an account already linked to this provider is used as it is, then
 * an address that matches an existing account joins it, and only then is a new account
 * made. A person who started with a password therefore keeps their history.
 */
export async function resolveOAuthUser(profile: OAuthProfile): Promise<UserRow> {
  const linked = await findAccount(profile.provider, profile.providerId);

  if (linked !== null) {
    const user = await findUserById(linked.user_id);

    if (user !== null) {
      return user;
    }
  }

  const email = accountEmail(profile);
  const existing = await findUserByEmail(email);

  if (existing !== null) {
    await linkAccount(existing.id, profile.provider, profile.providerId);
    return existing;
  }

  try {
    const created = await createUser({ email });

    await linkAccount(created.id, profile.provider, profile.providerId);
    return created;
  } catch (err) {
    if (err instanceof DuplicateEmailError) {
      // Two callbacks for the same new person arrived together, and the other one won.
      // Joining the account it made beats failing a sign-in that has already worked.
      const raced = await findUserByEmail(email);

      if (raced !== null) {
        await linkAccount(raced.id, profile.provider, profile.providerId);
        return raced;
      }
    }

    throw err;
  }
}
