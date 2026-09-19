import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { config } from '../config.js';
import type { UserRow } from '../db/types.js';
import { AppError } from '../middleware/error.js';
import {
  createUser,
  DuplicateEmailError,
  findUserByEmail,
  findUserById,
} from '../repositories/users.js';
import type { LoginInput, RegisterInput } from '../schemas/auth.schema.js';
import { signToken } from '../utils/jwt.js';
import { hashPassword, verifyPassword } from '../utils/password.js';

const PLACEHOLDER_HASH = '$2b$10$IiZ3sPUxSl96PDrVWk4qRumdU7FKYuTBydGbhezDvQgdtqqhxUKvy';

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

export async function register(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as RegisterInput;
  const passwordHash = await hashPassword(password);

  let user: UserRow;

  try {
    user = await createUser({ email, passwordHash });
  } catch (err) {
    if (err instanceof DuplicateEmailError) {
      throw new AppError('An account with that email already exists', 409);
    }

    throw err;
  }

  res.status(201).json({ user: serializeUser(user) });
}

// A throwaway account: no email to verify, no password anyone can guess, and a
// cap on how much it can upload. The hash is of a random secret rather than a
// sentinel, so an attempt to sign in against a guest email fails with 401
// instead of erroring on an unusable hash.
export async function guest(_req: Request, res: Response): Promise<void> {
  const email = `guest-${randomUUID()}@guest.local`;
  const passwordHash = await hashPassword(randomUUID());

  const user = await createUser({ email, passwordHash, isGuest: true });
  const token = signToken({ sub: user.id, email: user.email });

  res.status(201).json({ token, user: serializeUser(user) });
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as LoginInput;

  const user = await findUserByEmail(email);
  const passwordHash = user?.password_hash ?? PLACEHOLDER_HASH;
  const passwordMatches = await verifyPassword(password, passwordHash);

  if (user === null || !passwordMatches) {
    throw new AppError('Invalid email or password', 401);
  }

  const token = signToken({ sub: user.id, email: user.email });

  res.json({ token });
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
