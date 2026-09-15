import type { Request, Response } from 'express';
import { createUser } from '../repositories/users.js';
import { hashPassword } from '../utils/password.js';

export async function register(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as { email: string; password: string };
  const passwordHash = hashPassword(password);

  const user = await createUser({ email, passwordHash });

  res.status(201).json({
    user: {
      id: user.id,
      email: user.email,
      createdAt: user.created_at,
    },
  });
}
