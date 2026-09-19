import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { after, before, describe, it } from 'node:test';
import app from '../../src/app.js';
import { config } from '../../src/config.js';
import { pool } from '../../src/db/pool.js';
import { signToken } from '../../src/utils/jwt.js';

const runId = Date.now();
const emailA = `test-a-${runId}@example.com`;
const emailB = `test-b-${runId}@example.com`;
const emailC = `test-c-${runId}@example.com`;
const password = 'hunter2hunter2';

let server: Server;
let baseUrl: string;

function jsonRequest(body: unknown, token?: string): RequestInit {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (token !== undefined) {
    headers.Authorization = `Bearer ${token}`;
  }

  return { method: 'POST', headers, body: JSON.stringify(body) };
}

function authed(token: string): RequestInit {
  return { headers: { Authorization: `Bearer ${token}` } };
}

async function registerAndLogin(email: string): Promise<string> {
  await fetch(`${baseUrl}/api/auth/register`, jsonRequest({ email, password }));

  const response = await fetch(`${baseUrl}/api/auth/login`, jsonRequest({ email, password }));
  const body = (await response.json()) as { token: string };

  return body.token;
}

async function findUserId(email: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [
    email,
  ]);

  const id = rows[0]?.id;

  if (id === undefined) {
    throw new Error(`No user for ${email}`);
  }

  return id;
}

async function seedImages(userId: string, count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await pool.query(
      `INSERT INTO images (user_id, original_key, mime_type, size_bytes)
       VALUES ($1, $2, 'image/png', 1000)`,
      [userId, `test/${userId}/${index}`],
    );
  }
}

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => {
    server.once('listening', resolve);
  });

  const address = server.address();

  if (address === null || typeof address === 'string') {
    throw new Error('Server did not bind to a port');
  }

  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  try {
    await pool.query('DELETE FROM users WHERE email = ANY($1)', [[emailA, emailB, emailC]]);
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
    });
    await pool.end();
  }
});

describe('auth', () => {
  it('registers a new user', async () => {
    const response = await fetch(
      `${baseUrl}/api/auth/register`,
      jsonRequest({ email: emailA, password }),
    );

    assert.equal(response.status, 201);
  });

  it('rejects a second registration for the same email', async () => {
    const response = await fetch(
      `${baseUrl}/api/auth/register`,
      jsonRequest({ email: emailA, password }),
    );
    const body = (await response.json()) as { error: { message: string } };

    assert.equal(response.status, 409);
    assert.equal(body.error.message, 'An account with that email already exists');
  });

  it('rejects a password under eight characters', async () => {
    const response = await fetch(
      `${baseUrl}/api/auth/register`,
      jsonRequest({ email: `short-${runId}@example.com`, password: 'short' }),
    );

    assert.equal(response.status, 400);
  });

  it('rejects a malformed email', async () => {
    const response = await fetch(
      `${baseUrl}/api/auth/register`,
      jsonRequest({ email: 'not-an-email', password }),
    );

    assert.equal(response.status, 400);
  });

  it('logs in and returns a token', async () => {
    const response = await fetch(
      `${baseUrl}/api/auth/login`,
      jsonRequest({ email: emailA, password }),
    );
    const body = (await response.json()) as { token: string };

    assert.equal(response.status, 200);
    assert.ok(body.token.length > 20);
  });

  it('rejects the wrong password', async () => {
    const response = await fetch(
      `${baseUrl}/api/auth/login`,
      jsonRequest({ email: emailA, password: 'definitely-wrong' }),
    );

    assert.equal(response.status, 401);
  });

  it('answers identically for an unknown email and a wrong password', async () => {
    const unknownEmail = await fetch(
      `${baseUrl}/api/auth/login`,
      jsonRequest({ email: `nobody-${runId}@example.com`, password }),
    );
    const wrongPassword = await fetch(
      `${baseUrl}/api/auth/login`,
      jsonRequest({ email: emailA, password: 'definitely-wrong' }),
    );

    assert.equal(unknownEmail.status, 401);
    assert.equal(wrongPassword.status, 401);
    assert.deepEqual(await unknownEmail.json(), await wrongPassword.json());
  });

  it('rejects /me without a token', async () => {
    const response = await fetch(`${baseUrl}/api/auth/me`);

    assert.equal(response.status, 401);
  });

  it('returns the signed-in user from /me', async () => {
    const token = await registerAndLogin(emailB);
    const response = await fetch(`${baseUrl}/api/auth/me`, authed(token));
    const body = (await response.json()) as { user: { email: string } };

    assert.equal(response.status, 200);
    assert.equal(body.user.email, emailB);
  });
});

describe('image listing', () => {
  let tokenA = '';
  let tokenB = '';

  before(async () => {
    tokenA = await registerAndLogin(emailA);
    tokenB = await registerAndLogin(emailB);

    await seedImages(await findUserId(emailA), 3);
    await seedImages(await findUserId(emailB), 1);
  });

  it('rejects an unauthenticated request', async () => {
    const response = await fetch(`${baseUrl}/api/images`);

    assert.equal(response.status, 401);
  });

  it('returns only the caller own images', async () => {
    const response = await fetch(`${baseUrl}/api/images`, authed(tokenA));
    const body = (await response.json()) as { total: number; images: unknown[] };

    assert.equal(response.status, 200);
    assert.equal(body.total, 3);
    assert.equal(body.images.length, 3);
  });

  it('never leaks another user rows', async () => {
    const response = await fetch(`${baseUrl}/api/images`, authed(tokenB));
    const body = (await response.json()) as { total: number };

    assert.equal(body.total, 1);
  });

  it('paginates', async () => {
    const response = await fetch(`${baseUrl}/api/images?page=1&limit=2`, authed(tokenA));
    const body = (await response.json()) as {
      images: unknown[];
      totalPages: number;
      total: number;
    };

    assert.equal(body.images.length, 2);
    assert.equal(body.totalPages, 2);
    assert.equal(body.total, 3);
  });

  it('rejects an out-of-range limit', async () => {
    const response = await fetch(`${baseUrl}/api/images?limit=500`, authed(tokenA));

    assert.equal(response.status, 400);
  });
});

describe('downloads', () => {
  let token = '';
  let originalId = '';
  let processedId = '';

  before(async () => {
    token = await registerAndLogin(emailC);
    const userId = await findUserId(emailC);

    const original = await pool.query<{ id: string }>(
      `INSERT INTO images (user_id, original_key, mime_type, size_bytes, original_filename)
       VALUES ($1, $2, 'image/jpeg', 2048, 'holiday photo.jpg')
       RETURNING id`,
      [userId, `test/${userId}/original`],
    );

    // Signed URLs are produced locally, so these rows never need real objects.
    const processed = await pool.query<{ id: string }>(
      `INSERT INTO images (user_id, original_key, mime_type, size_bytes, original_filename,
                           processed_key, processed_mime_type, status)
       VALUES ($1, $2, 'image/png', 2048, 'logo.png', $3, 'image/webp', 'ready')
       RETURNING id`,
      [userId, `test/${userId}/original-2`, `test/${userId}/processed-2`],
    );

    originalId = original.rows[0]?.id ?? '';
    processedId = processed.rows[0]?.id ?? '';
  });

  it('rejects an unauthenticated request', async () => {
    const response = await fetch(`${baseUrl}/api/images/${originalId}/download`);

    assert.equal(response.status, 401);
  });

  it('signs a url that saves the original under its own name', async () => {
    const response = await fetch(`${baseUrl}/api/images/${originalId}/download`, authed(token));
    const body = (await response.json()) as { download: { url: string; filename: string } };
    const decoded = decodeURIComponent(body.download.url).replace(/\+/g, ' ');

    assert.equal(response.status, 200);
    assert.equal(body.download.filename, 'holiday photo.jpg');
    assert.ok(body.download.url.includes('response-content-disposition='));
    assert.ok(decoded.includes('attachment; filename="holiday photo.jpg"'));
  });

  it('renames a processed result to the format it was encoded as', async () => {
    const response = await fetch(
      `${baseUrl}/api/images/${processedId}/download?variant=processed`,
      authed(token),
    );
    const body = (await response.json()) as { download: { filename: string } };

    assert.equal(response.status, 200);
    assert.equal(body.download.filename, 'logo.webp');
  });

  it('refuses a processed download before there is a result', async () => {
    const response = await fetch(
      `${baseUrl}/api/images/${originalId}/download?variant=processed`,
      authed(token),
    );

    assert.equal(response.status, 404);
  });

  it('rejects an unknown variant', async () => {
    const response = await fetch(
      `${baseUrl}/api/images/${originalId}/download?variant=enormous`,
      authed(token),
    );

    assert.equal(response.status, 400);
  });

  it('hides an image that belongs to somebody else', async () => {
    const otherToken = await registerAndLogin(emailA);
    const response = await fetch(
      `${baseUrl}/api/images/${originalId}/download`,
      authed(otherToken),
    );

    assert.equal(response.status, 404);
  });
});

describe('deleting', () => {
  let token = '';
  let userId = '';

  before(async () => {
    // Signing in rather than registering: the register+login pair shares one
    // rate-limit budget with every other auth request in this file.
    const response = await fetch(
      `${baseUrl}/api/auth/login`,
      jsonRequest({ email: emailC, password }),
    );
    const body = (await response.json()) as { token: string };

    token = body.token;
    userId = await findUserId(emailC);
  });

  async function seed(count: number): Promise<void> {
    for (let index = 0; index < count; index += 1) {
      await pool.query(
        `INSERT INTO images (user_id, original_key, mime_type, size_bytes)
         VALUES ($1, $2, 'image/png', 1000)`,
        [userId, `test/${userId}/delete-${index}-${Math.random()}`],
      );
    }
  }

  it('rejects an unauthenticated request', async () => {
    const response = await fetch(`${baseUrl}/api/images`, { method: 'DELETE' });

    assert.equal(response.status, 401);
  });

  it('deletes one image and reports how many went', async () => {
    await seed(2);

    const listed = await fetch(`${baseUrl}/api/images`, authed(token));
    const before = (await listed.json()) as { images: Array<{ id: string }>; total: number };

    const response = await fetch(`${baseUrl}/api/images/${before.images[0]?.id}`, {
      method: 'DELETE',
      ...authed(token),
    });
    const body = (await response.json()) as { deleted: number };

    assert.equal(response.status, 200);
    assert.equal(body.deleted, 1);

    const relisted = await fetch(`${baseUrl}/api/images`, authed(token));
    const after = (await relisted.json()) as { total: number };

    assert.equal(after.total, before.total - 1);
  });

  it('hides an image that belongs to somebody else', async () => {
    const otherUserId = await findUserId(emailA);
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO images (user_id, original_key, mime_type, size_bytes)
       VALUES ($1, $2, 'image/png', 1000)
       RETURNING id`,
      [otherUserId, `test/${otherUserId}/not-yours`],
    );

    const response = await fetch(`${baseUrl}/api/images/${rows[0]?.id}`, {
      method: 'DELETE',
      ...authed(token),
    });

    assert.equal(response.status, 404);
  });

  it('clears the whole history', async () => {
    const response = await fetch(`${baseUrl}/api/images`, {
      method: 'DELETE',
      ...authed(token),
    });
    const body = (await response.json()) as { deleted: number };

    assert.equal(response.status, 200);
    assert.ok(body.deleted >= 1);

    const relisted = await fetch(`${baseUrl}/api/images`, authed(token));
    const after = (await relisted.json()) as { total: number };

    assert.equal(after.total, 0);
  });

  it('reports nothing deleted when the history is already empty', async () => {
    const response = await fetch(`${baseUrl}/api/images`, {
      method: 'DELETE',
      ...authed(token),
    });
    const body = (await response.json()) as { deleted: number };

    assert.equal(response.status, 200);
    assert.equal(body.deleted, 0);
  });
});

describe('guest sessions', () => {
  let token = '';
  let guestId = '';
  let uploadLimit = 0;

  before(async () => {
    const response = await fetch(`${baseUrl}/api/auth/guest`, { method: 'POST' });
    const body = (await response.json()) as {
      token: string;
      user: { id: string; guest: boolean; uploadLimit: number | null };
    };

    assert.equal(response.status, 201);

    token = body.token;
    guestId = body.user.id;
    uploadLimit = body.user.uploadLimit ?? 0;
  });

  after(async () => {
    // The suite's global cleanup only knows the three registered test accounts,
    // so the guest this file created has to be removed here.
    await pool.query('DELETE FROM users WHERE id = $1', [guestId]);
  });

  it('is issued with a cap attached', () => {
    assert.equal(uploadLimit, 5);
  });

  it('reports itself as a guest on /me', async () => {
    const response = await fetch(`${baseUrl}/api/auth/me`, authed(token));
    const body = (await response.json()) as {
      user: { guest: boolean; uploadLimit: number | null; uploadsUsed: number };
    };

    assert.equal(response.status, 200);
    assert.equal(body.user.guest, true);
    assert.equal(body.user.uploadLimit, 5);
    assert.equal(body.user.uploadsUsed, 0);
  });

  it('starts with an empty history of its own', async () => {
    const response = await fetch(`${baseUrl}/api/images`, authed(token));
    const body = (await response.json()) as { total: number };

    assert.equal(body.total, 0);
  });

  // A one-pixel PNG header: enough for the magic-byte check to accept it, so the
  // request reaches the cap before anything is sent to storage.
  function uploadAttempt(): Promise<Response> {
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
      0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f,
      0x15, 0xc4, 0x89,
    ]);

    const form = new FormData();
    form.append('image', new Blob([png], { type: 'image/png' }), 'over.png');

    return fetch(`${baseUrl}/api/images`, {
      method: 'POST',
      ...authed(token),
      body: form,
    });
  }

  // Written straight to the column because a real upload would need storage; the
  // cap itself is what these tests are pinning down.
  async function spendAllowance(count: number): Promise<void> {
    await pool.query('UPDATE users SET guest_upload_count = $2 WHERE id = $1', [guestId, count]);
  }

  it('refuses an upload once the allowance is spent, without storing anything', async () => {
    await spendAllowance(uploadLimit);

    const response = await uploadAttempt();

    assert.equal(response.status, 403);

    // The cap is checked before the object is written, so nothing was added.
    const { rows } = await pool.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM images WHERE user_id = $1',
      [guestId],
    );

    assert.equal(rows[0]?.count, 0);
  });

  it('does not refund an upload when the history is deleted', async () => {
    await seedImages(guestId, 3);

    const cleared = await fetch(`${baseUrl}/api/images`, {
      method: 'DELETE',
      ...authed(token),
    });

    assert.equal(cleared.status, 200);

    const relisted = await fetch(`${baseUrl}/api/images`, authed(token));
    const after = (await relisted.json()) as { total: number };

    assert.equal(after.total, 0);

    // The allowance is spent rather than borrowed, so an empty history does not
    // reopen it - this is the whole point of counting uploads instead of rows.
    const response = await uploadAttempt();

    assert.equal(response.status, 403);
  });

  it('reports the spent allowance on /me', async () => {
    const response = await fetch(`${baseUrl}/api/auth/me`, authed(token));
    const body = (await response.json()) as { user: { uploadsUsed: number } };

    assert.equal(body.user.uploadsUsed, uploadLimit);
  });
});

describe('history limit', () => {
  const email = `history-${runId}@example.com`;
  let token = '';
  let userId = '';
  let scratchId = '';

  before(async () => {
    // Inserted directly and given a token rather than going through
    // /auth/register: the register and login pair share one rate-limit budget
    // with every other auth request in this file, and this block only needs a
    // caller whose listing is empty to start with.
    const { rows } = await pool.query<{ id: string }>(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
      [email, 'not-a-real-hash'],
    );

    userId = rows[0]?.id ?? '';
    token = signToken({ sub: userId, email });
  });

  after(async () => {
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
  });

  it('lists the history, and counts only that towards the total', async () => {
    await seedImages(userId, config.historyLimit);

    const listed = await fetch(`${baseUrl}/api/images?limit=100`, authed(token));
    const body = (await listed.json()) as { images: unknown[]; total: number };

    assert.equal(body.total, config.historyLimit);
    assert.equal(body.images.length, config.historyLimit);
  });

  it('keeps a result past the cap out of the history but still reachable', async () => {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO images (user_id, original_key, mime_type, size_bytes, ephemeral)
       VALUES ($1, $2, 'image/png', 1000, true)
       RETURNING id`,
      [userId, `test/${userId}/scratch`],
    );

    scratchId = rows[0]?.id ?? '';

    const listed = await fetch(`${baseUrl}/api/images?limit=100`, authed(token));
    const body = (await listed.json()) as { images: Array<{ id: string }>; total: number };

    // Not part of the history, so it neither shows up nor counts towards the cap.
    assert.equal(body.total, config.historyLimit);
    assert.ok(!body.images.some((image) => image.id === scratchId));

    // Still fetchable by id, which is what makes the result reachable without
    // being kept: the job panel signs a url for it either way.
    const fetched = await fetch(`${baseUrl}/api/images/${scratchId}`, authed(token));

    assert.equal(fetched.status, 200);
  });

  it('clears the scratch slot along with the history', async () => {
    const response = await fetch(`${baseUrl}/api/images`, {
      method: 'DELETE',
      ...authed(token),
    });
    const body = (await response.json()) as { deleted: number };

    // Clearing the archive takes the unlisted scratch with it, rather than
    // leaving a row the user cannot see or remove.
    assert.equal(body.deleted, config.historyLimit + 1);

    const relisted = await fetch(`${baseUrl}/api/images`, authed(token));
    const after = (await relisted.json()) as { total: number };

    assert.equal(after.total, 0);
  });
});
