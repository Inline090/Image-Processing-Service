import type { Request, Response } from 'express';
import { AppError } from '../middleware/error.js';
import { createUser, findUserByEmail, findUserById } from '../repositories/users.js';
import { signToken } from '../utils/jwt.js';
import { hashPassword, verifyPassword } from '../utils/password.js';

export async function register(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as { email: string; password: string };
  const passwordHash = await hashPassword(password);

  const user = await createUser({ email, passwordHash });

  res.status(201).json({
    user: {
      id: user.id,
      email: user.email,
      createdAt: user.created_at,
    },
  });
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as { email: string; password: string };

  const user = await findUserByEmail(email);
  if (user === null) {
    throw new AppError('No account found for that email', 404);
  }

  const passwordMatches = await verifyPassword(password, user.password_hash);
  if (!passwordMatches) {
    throw new AppError('Incorrect password', 401);
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

  res.json({
    user: {
      id: user.id,
      email: user.email,
      createdAt: user.created_at,
    },
  });
}
