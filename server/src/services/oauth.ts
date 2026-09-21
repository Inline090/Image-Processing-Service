import type { OAuthProvider } from '../auth/providers.js';
import type { UserRow } from '../db/types.js';
import { findAccount, linkAccount } from '../repositories/oauthAccounts.js';
import {
  createUser,
  DuplicateEmailError,
  findUserByEmail,
  findUserById,
  setUserAvatar,
} from '../repositories/users.js';

export type OAuthProfile = {
  provider: OAuthProvider;

  providerId: string;

  email: string | null;

  avatarUrl?: string | null;
};

export function accountEmail(profile: OAuthProfile): string {
  return profile.email ?? `${profile.provider}-${profile.providerId}@${profile.provider}.local`;
}

// Matches the provider id first, then a verified address, then creates an account.
export async function resolveOAuthUser(profile: OAuthProfile): Promise<UserRow> {
  const avatarUrl = profile.avatarUrl ?? null;
  const linked = await findAccount(profile.provider, profile.providerId);

  if (linked !== null) {
    const user = await findUserById(linked.user_id);

    if (user !== null) {
      return (await setUserAvatar(user.id, avatarUrl)) ?? user;
    }
  }

  const email = accountEmail(profile);
  const existing = await findUserByEmail(email);

  if (existing !== null) {
    await linkAccount(existing.id, profile.provider, profile.providerId);
    return (await setUserAvatar(existing.id, avatarUrl)) ?? existing;
  }

  try {
    const created = await createUser({ email, avatarUrl });

    await linkAccount(created.id, profile.provider, profile.providerId);
    return created;
  } catch (err) {
    if (err instanceof DuplicateEmailError) {
      const raced = await findUserByEmail(email);

      if (raced !== null) {
        await linkAccount(raced.id, profile.provider, profile.providerId);
        return raced;
      }
    }

    throw err;
  }
}
