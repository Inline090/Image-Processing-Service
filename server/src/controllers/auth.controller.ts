import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { config } from '../config.js';
import type { UserRow } from '../db/types.js';
import { AppError } from '../middleware/error.js';
import { createUser, findUserById } from '../repositories/users.js';
import { notifyAddress } from '../services/email.js';
import { guestUploadsUsed } from '../services/guestAllowance.js';
import { signToken } from '../utils/jwt.js';
import { guestKey } from '../middleware/guestSession.js';

async function serializeUser(user: UserRow, usageKey: string | null) {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.created_at,
    avatarUrl: user.avatar_url,
    guest: user.is_guest,
    uploadLimit: user.is_guest ? config.guestUploadLimit : null,
    emailable: notifyAddress(user.email) !== null,
    uploadsUsed: await guestUploadsUsed(user, usageKey),
  };
}

export async function guest(req: Request, res: Response): Promise<void> {
  const email = `guest-${randomUUID()}@guest.local`;

  const user = await createUser({ email, isGuest: true });
  const token = signToken({ sub: user.id, email: user.email });

  res.status(201).json({ token, user: await serializeUser(user, guestKey(req)) });
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

  res.json({ user: await serializeUser(user, guestKey(req)) });
}
