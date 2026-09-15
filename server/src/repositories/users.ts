import { pool } from '../db/pool.js';
import type { UserRow } from '../db/types.js';

export type NewUser = {
  email: string;
  passwordHash: string;
};

export async function createUser({ email, passwordHash }: NewUser): Promise<UserRow> {
  const { rows } = await pool.query<UserRow>(
    `INSERT INTO users (email, password_hash)
     VALUES ($1, $2)
     RETURNING id, email, password_hash, created_at`,
    [email, passwordHash],
  );

  const user = rows[0];
  if (user === undefined) {
    throw new Error('Insert returned no row');
  }
  return user;
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const { rows } = await pool.query<UserRow>(
    'SELECT id, email, password_hash, created_at FROM users WHERE email = $1',
    [email],
  );

  return rows[0] ?? null;
}

export async function findUserById(id: string): Promise<UserRow | null> {
  const { rows } = await pool.query<UserRow>(
    'SELECT id, email, password_hash, created_at FROM users WHERE id = $1',
    [id],
  );

  return rows[0] ?? null;
}
