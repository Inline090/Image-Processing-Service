import { pool } from '../db/pool.js';
import type { UserRow } from '../db/types.js';

export type NewUser = {
  email: string;
  isGuest?: boolean;
  avatarUrl?: string | null;
};

const USER_COLUMNS =
  'id, email, password_hash, is_guest, guest_upload_count, avatar_url, created_at';

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

export async function createUser({
  email,
  isGuest = false,
  avatarUrl = null,
}: NewUser): Promise<UserRow> {
  let rows: UserRow[];

  try {
    const result = await pool.query<UserRow>(
      `INSERT INTO users (email, is_guest, avatar_url)
       VALUES ($1, $2, $3)
       RETURNING ${USER_COLUMNS}`,
      [email, isGuest, avatarUrl],
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

// A spend rather than a count of live images, so deleting history refunds nothing.
export async function recordGuestUpload(userId: string, count = 1): Promise<void> {
  await pool.query('UPDATE users SET guest_upload_count = guest_upload_count + $2 WHERE id = $1', [
    userId,
    count,
  ]);
}
