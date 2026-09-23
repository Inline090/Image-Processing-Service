import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { after, before, describe, it } from 'node:test';
import app from '../../src/app.js';
import { config, MAX_BULK_IMAGES } from '../../src/config.js';
import { pool } from '../../src/db/pool.js';
import { hashTransformOptions } from '../../src/processing/optionsHash.js';
import { signToken } from '../../src/utils/jwt.js';

process.env.AWS_ACCESS_KEY_ID ??= 'test-placeholder';
process.env.AWS_SECRET_ACCESS_KEY ??= 'test-placeholder';
process.env.AWS_EC2_METADATA_DISABLED ??= 'true';

const runId = Date.now();
const emailA = `test-a-${runId}@example.com`;
const emailB = `test-b-${runId}@example.com`;
const emailC = `test-c-${runId}@example.com`;

let server: Server;
let baseUrl: string;

function authed(token: string): RequestInit {
  return { headers: { Authorization: `Bearer ${token}` } };
}

async function tokenFor(email: string): Promise<string> {
  const existing = await pool.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [
    email,
  ]);

  const created =
    existing.rows[0] === undefined
      ? await pool.query<{ id: string }>('INSERT INTO users (email) VALUES ($1) RETURNING id', [
          email,
        ])
      : existing;

  const id = created.rows[0]?.id;

  if (id === undefined) {
    throw new Error(`No user for ${email}`);
  }

  return signToken({ sub: id, email });
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

describe('account details', () => {
  it('rejects /me without a token', async () => {
    const response = await fetch(`${baseUrl}/api/auth/me`);

    assert.equal(response.status, 401);
  });

  it('returns the signed-in user from /me', async () => {
    const token = await tokenFor(emailB);
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
    tokenA = await tokenFor(emailA);
    tokenB = await tokenFor(emailB);

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
    token = await tokenFor(emailC);
    const userId = await findUserId(emailC);

    const original = await pool.query<{ id: string }>(
      `INSERT INTO images (user_id, original_key, mime_type, size_bytes, original_filename)
       VALUES ($1, $2, 'image/jpeg', 2048, 'holiday photo.jpg')
       RETURNING id`,
      [userId, `test/${userId}/original`],
    );

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
    assert.ok(decoded.includes("attachment; filename*=UTF-8''holiday%20photo.jpg"));
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
    const otherToken = await tokenFor(emailA);
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
    token = await tokenFor(emailC);
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

  async function spendAllowance(count: number): Promise<void> {
    await pool.query('UPDATE users SET guest_upload_count = $2 WHERE id = $1', [guestId, count]);
  }

  it('refuses an upload once the allowance is spent, without storing anything', async () => {
    await spendAllowance(uploadLimit);

    const response = await uploadAttempt();

    assert.equal(response.status, 403);

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

  before(async () => {
    token = await tokenFor(email);
    userId = await findUserId(email);
  });

  after(async () => {
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
  });

  it('lists everything the user owns, and counts it in the total', async () => {
    await seedImages(userId, config.historyLimit);

    const listed = await fetch(`${baseUrl}/api/images?limit=100`, authed(token));
    const body = (await listed.json()) as { images: unknown[]; total: number };

    assert.equal(body.total, config.historyLimit);
    assert.equal(body.images.length, config.historyLimit);
  });

  it('refuses an upload once the history is full', async () => {
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
      0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f,
      0x15, 0xc4, 0x89,
    ]);

    const form = new FormData();
    form.append('image', new Blob([png], { type: 'image/png' }), 'over.png');

    const response = await fetch(`${baseUrl}/api/images`, {
      method: 'POST',
      ...authed(token),
      body: form,
    });

    assert.equal(response.status, 403);

    const { rows } = await pool.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM images WHERE user_id = $1',
      [userId],
    );

    assert.equal(rows[0]?.count, config.historyLimit);
  });

  it('clears the whole history', async () => {
    const response = await fetch(`${baseUrl}/api/images`, {
      method: 'DELETE',
      ...authed(token),
    });
    const body = (await response.json()) as { deleted: number };

    assert.equal(body.deleted, config.historyLimit);

    const relisted = await fetch(`${baseUrl}/api/images`, authed(token));
    const after = (await relisted.json()) as { total: number };

    assert.equal(after.total, 0);
  });
});

describe('bulk transform', () => {
  const email = `bulk-${runId}@example.com`;
  let token = '';
  let userId = '';

  before(async () => {
    const { rows } = await pool.query<{ id: string }>(
      'INSERT INTO users (email) VALUES ($1) RETURNING id',
      [email],
    );

    userId = rows[0]?.id ?? '';
    token = signToken({ sub: userId, email });

    await seedImages(userId, 3);
  });

  after(async () => {
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
  });

  async function idsOf(): Promise<string[]> {
    const response = await fetch(`${baseUrl}/api/images`, authed(token));
    const body = (await response.json()) as { images: Array<{ id: string }> };

    return body.images.map((image) => image.id);
  }

  function bulkRequest(imageIds: string[], options: unknown): RequestInit {
    return {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ imageIds, options }),
    };
  }

  async function seedBatch(count: number): Promise<string> {
    const { rows } = await pool.query<{ id: string }>('SELECT gen_random_uuid() AS id');
    const batchId = rows[0]?.id ?? '';

    for (let index = 0; index < count; index += 1) {
      await pool.query(
        `INSERT INTO jobs (image_id, user_id, options, options_hash, batch_id)
         SELECT id, $1, '{}'::jsonb, $2, $3 FROM images
         WHERE user_id = $1 ORDER BY created_at OFFSET $4 LIMIT 1`,
        [userId, `bulk-${batchId}-${index}`, batchId, index],
      );
    }

    return batchId;
  }

  it('reports a batch from its own jobs, and settles once they finish', async () => {
    const batchId = await seedBatch(3);

    const started = await fetch(`${baseUrl}/api/jobs/batch/${batchId}`, authed(token));
    const body = (await started.json()) as {
      total: number;
      pending: number;
      ready: number;
      settled: boolean;
    };

    assert.equal(started.status, 200);
    assert.equal(body.total, 3);
    assert.equal(body.pending, 3);
    assert.equal(body.ready, 0);
    assert.equal(body.settled, false);

    await pool.query(`UPDATE jobs SET status = 'ready' WHERE batch_id = $1`, [batchId]);

    const finished = await fetch(`${baseUrl}/api/jobs/batch/${batchId}`, authed(token));
    const done = (await finished.json()) as { ready: number; settled: boolean };

    assert.equal(done.ready, 3);
    assert.equal(done.settled, true);
  });

  it('hides a batch that belongs to somebody else', async () => {
    const batchId = await seedBatch(1);
    const otherToken = await tokenFor(emailA);

    const response = await fetch(`${baseUrl}/api/jobs/batch/${batchId}`, authed(otherToken));

    assert.equal(response.status, 404);
  });

  it('refuses the whole request when one image is not the caller own', async () => {
    const ids = await idsOf();
    const otherUser = await findUserId(emailA);
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO images (user_id, original_key, mime_type, size_bytes)
       VALUES ($1, $2, 'image/png', 1000) RETURNING id`,
      [otherUser, `test/${otherUser}/bulk-not-yours`],
    );
    const foreign = rows[0]?.id ?? '';
    const asked = [foreign, ...ids];

    const jobsFor = async (): Promise<number> => {
      const { rows: counted } = await pool.query<{ count: number }>(
        'SELECT count(*)::int AS count FROM jobs WHERE image_id = ANY($1::uuid[])',
        [asked],
      );

      return counted[0]?.count ?? 0;
    };

    const before = await jobsFor();

    const response = await fetch(
      `${baseUrl}/api/images/transform-bulk`,
      bulkRequest(asked, { width: 64 }),
    );

    assert.equal(response.status, 404);
    assert.equal(await jobsFor(), before);
  });

  it('rejects a batch larger than the cap', async () => {
    const over = Array.from(
      { length: MAX_BULK_IMAGES + 1 },
      (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    );

    const response = await fetch(
      `${baseUrl}/api/images/transform-bulk`,
      bulkRequest(over, { width: 64 }),
    );

    assert.equal(response.status, 400);
  });

  it('rejects a batch with no images', async () => {
    const response = await fetch(
      `${baseUrl}/api/images/transform-bulk`,
      bulkRequest([], { width: 64 }),
    );

    assert.equal(response.status, 400);
  });
});

describe('cache reuse across uploads', () => {
  it('serves the stored result when the same picture is uploaded again', async () => {
    const email = `test-reuse-${runId}@example.com`;
    const token = await tokenFor(email);
    const userId = await findUserId(email);
    const digest = 'e'.repeat(64);
    const options = { width: 320, format: 'webp' as const };
    const optionsHash = hashTransformOptions(digest, options);

    const insertImage = async (name: string): Promise<string> => {
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO images (user_id, original_key, mime_type, size_bytes, content_hash)
         VALUES ($1, $2, 'image/png', 1000, $3) RETURNING id`,
        [userId, `test/${userId}/${name}`, digest],
      );

      return rows[0]?.id ?? '';
    };

    const firstUpload = await insertImage('first');
    const secondUpload = await insertImage('second');

    const { rows: seeded } = await pool.query<{ id: string }>(
      `INSERT INTO jobs (image_id, user_id, options, options_hash, status, processed_key, format, width, height)
       VALUES ($1, $2, $3, $4, 'ready', 'processed/shared/one', 'webp', 320, 240)
       RETURNING id`,
      [firstUpload, userId, JSON.stringify(options), optionsHash],
    );

    const response = await fetch(`${baseUrl}/api/images/${secondUpload}/transform`, {
      method: 'POST',
      headers: { ...authed(token).headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });

    assert.equal(response.status, 200);

    const body = (await response.json()) as { cached: boolean; job: { id: string } };

    assert.equal(body.cached, true);
    assert.equal(body.job.id, seeded[0]?.id);

    const { rows: linked } = await pool.query<{ processed_key: string | null }>(
      'SELECT processed_key FROM images WHERE id = $1',
      [secondUpload],
    );

    assert.equal(linked[0]?.processed_key, 'processed/shared/one');
  });
});
