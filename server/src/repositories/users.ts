import { pool } from '../db/pool.js';
import type { UserRow } from '../db/types.js';

export type NewUser = {
  email: string;
  passwordHash: string;
};

export class DuplicateEmailError extends Error {
  constructor(email: string) {
    super(`An account already exists for ${email}`);
    this.name = 'DuplicateEmailError';
  }
}

const UNIQUE_VIOLATION = '23505';

// PostgreSQL reports a violated UNIQUE constraint as SQLSTATE 23505. The only
// such constraint on this table is the email column, so this cannot be another
// column reporting a clash.
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && (err as { code?: unknown }).code === UNIQUE_VIOLATION
  );
}

export async function createUser({ email, passwordHash }: NewUser): Promise<UserRow> {
  let rows: UserRow[];

  try {
    const result = await pool.query<UserRow>(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email, password_hash, created_at`,
      [email, passwordHash],
    );

    rows = result.rows;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new DuplicateEmailError(email);
    }

    throw err;
  }

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
