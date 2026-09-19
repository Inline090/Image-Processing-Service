import { pool } from '../db/pool.js';
import type { UserRow } from '../db/types.js';

export type NewUser = {
  email: string;
  isGuest?: boolean;
};

const USER_COLUMNS = 'id, email, password_hash, is_guest, guest_upload_count, created_at';

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

// No password is written: the column stays null and nothing can sign in against it.
export async function createUser({ email, isGuest = false }: NewUser): Promise<UserRow> {
  let rows: UserRow[];

  try {
    const result = await pool.query<UserRow>(
      `INSERT INTO users (email, is_guest)
       VALUES ($1, $2)
       RETURNING ${USER_COLUMNS}`,
      [email, isGuest],
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

// Spend one unit of a guest's allowance. Deliberately a counter rather than a
// count of live images: the allowance is consumed by the act of uploading and is
// never returned, so clearing the history cannot win quota back.
export async function recordGuestUpload(userId: string): Promise<void> {
  await pool.query('UPDATE users SET guest_upload_count = guest_upload_count + 1 WHERE id = $1', [
    userId,
  ]);
}
