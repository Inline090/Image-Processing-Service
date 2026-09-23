import { pool } from '../db/pool.js';
import type { UserRow } from '../db/types.js';

export type NewUser = {
  email: string;
  avatarUrl?: string | null;
};

const USER_COLUMNS = 'id, email, avatar_url, created_at';

// Turns the unique violation into a domain error, so the controller can answer 409.
export class DuplicateEmailError extends Error {
  constructor(email: string) {
    super(`An account already exists for ${email}`);
    this.name = 'DuplicateEmailError';
  }
}

const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && (err as { code?: unknown }).code === UNIQUE_VIOLATION
  );
}

export async function createUser({ email, avatarUrl = null }: NewUser): Promise<UserRow> {
  let rows: UserRow[];

  try {
    const result = await pool.query<UserRow>(
      `INSERT INTO users (email, avatar_url)
       VALUES ($1, $2)
       RETURNING ${USER_COLUMNS}`,
      [email, avatarUrl],
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
  const { rows } = await pool.query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE email = $1`, [
    email,
  ]);

  return rows[0] ?? null;
}

export async function findUserById(id: string): Promise<UserRow | null> {
  const { rows } = await pool.query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [
    id,
  ]);

  return rows[0] ?? null;
}

// The first sign-in creates the account; a second one finds it. Both paths are the same call,
// so two clicks on one link cannot race into two accounts.
export async function findOrCreateUserByEmail(email: string): Promise<UserRow> {
  const existing = await findUserByEmail(email);

  if (existing !== null) {
    return existing;
  }

  try {
    return await createUser({ email });
  } catch (err) {
    if (err instanceof DuplicateEmailError) {
      const raced = await findUserByEmail(email);

      if (raced !== null) {
        return raced;
      }
    }

    throw err;
  }
}

// Refreshes the picture on every sign-in, and leaves it alone when none is shared.
export async function setUserAvatar(id: string, avatarUrl: string | null): Promise<UserRow | null> {
  if (avatarUrl === null) {
    return null;
  }

  const { rows } = await pool.query<UserRow>(
    `UPDATE users SET avatar_url = $2 WHERE id = $1 RETURNING ${USER_COLUMNS}`,
    [id, avatarUrl],
  );

  return rows[0] ?? null;
}
