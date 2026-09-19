import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { config } from '../config.js';
import type { UserRow } from '../db/types.js';
import { AppError } from '../middleware/error.js';
import { createUser, findUserById } from '../repositories/users.js';
import { signToken } from '../utils/jwt.js';

// One shape wherever a user is returned, so the client can always read the
// account type and its cap from the same fields.
function serializeUser(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.created_at,
    guest: user.is_guest,
    uploadLimit: user.is_guest ? config.guestUploadLimit : null,
    // How much of that limit has been spent. Deletions do not lower it.
    uploadsUsed: user.guest_upload_count,
  };
}

// A throwaway account: no address to verify, no password, and a cap on how much it can
// upload. A real account is the way past that cap, and the way in is a provider.
export async function guest(_req: Request, res: Response): Promise<void> {
  const email = `guest-${randomUUID()}@guest.local`;

  const user = await createUser({ email, isGuest: true });
  const token = signToken({ sub: user.id, email: user.email });

  res.status(201).json({ token, user: serializeUser(user) });
}

export async function me(req: Request, res: Response): Promise<void> {
  const authUser = req.user;
  if (authUser === undefined) {
    throw new AppError('Not authenticated', 401);
  }

  const user = await findUserById(authUser.sub);
  if (user === null) {
    throw new AppError('User no longer exists', 404);
  }

  res.json({ user: serializeUser(user) });
}
