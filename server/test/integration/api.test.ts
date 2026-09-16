import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { after, before, describe, it } from 'node:test';
import app from '../../src/app.js';
import { pool } from '../../src/db/pool.js';

const runId = Date.now();
const emailA = `test-a-${runId}@example.com`;
const emailB = `test-b-${runId}@example.com`;
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
    await pool.query('DELETE FROM users WHERE email = ANY($1)', [[emailA, emailB]]);
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
