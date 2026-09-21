import { config } from '../config.js';
import type { UserRow } from '../db/types.js';
import { findGuestUploadCount, reserveGuestUploads } from '../repositories/guestUsage.js';

export async function guestUploadsUsed(user: UserRow, usageKey: string | null): Promise<number> {
  if (!user.is_guest) {
    return 0;
  }

  if (usageKey === null) {
    return user.guest_upload_count;
  }

  return Math.max(user.guest_upload_count, await findGuestUploadCount(usageKey));
}

export async function guestUploadsLeft(user: UserRow, usageKey: string | null): Promise<number> {
  return Math.max(0, config.guestUploadLimit - (await guestUploadsUsed(user, usageKey)));
}

// The reservation is the decision. The read above it only shapes how much to ask for.
export async function claimGuestUploads(
  user: UserRow,
  usageKey: string | null,
  wanted: number,
): Promise<number> {
  if (!user.is_guest) {
    return wanted;
  }

  const accountRoom = config.guestUploadLimit - user.guest_upload_count;

  if (accountRoom <= 0) {
    return 0;
  }

  const ask = Math.min(wanted, accountRoom);

  if (usageKey === null) {
    return ask;
  }

  const claimed = await reserveGuestUploads(usageKey, ask, config.guestUploadLimit);

  if (claimed !== null) {
    return ask;
  }

  const retry = Math.min(ask, await guestUploadsLeft(user, usageKey));

  if (retry === 0) {
    return 0;
  }

  return (await reserveGuestUploads(usageKey, retry, config.guestUploadLimit)) === null ? 0 : retry;
}
