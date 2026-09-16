import type { Request, Response } from 'express';
import { AppError } from '../middleware/error.js';
import { createUser, findUserByEmail, findUserById } from '../repositories/users.js';
import type { LoginInput, RegisterInput } from '../schemas/auth.schema.js';
import { signToken } from '../utils/jwt.js';
import { hashPassword, verifyPassword } from '../utils/password.js';

const PLACEHOLDER_HASH = '$2b$10$IiZ3sPUxSl96PDrVWk4qRumdU7FKYuTBydGbhezDvQgdtqqhxUKvy';

export async function register(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as RegisterInput;
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

  res.json({
    user: {
      id: user.id,
      email: user.email,
      createdAt: user.created_at,
    },
  });
}
