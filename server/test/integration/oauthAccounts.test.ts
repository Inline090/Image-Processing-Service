import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { after, before, describe, it } from 'node:test';

process.env.GOOGLE_CLIENT_ID = 'test-google-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret';
process.env.OAUTH_CALLBACK_BASE = 'http://localhost:3000/api/auth';
process.env.CLIENT_URL = 'http://localhost:5173';

const app = (await import('../../src/app.js')).default;
const { pool } = await import('../../src/db/pool.js');
const { accountEmail, resolveOAuthUser } = await import('../../src/services/oauth.js');

const runId = Date.now();
const createdEmails = new Set<string>();

let server: Server;
let baseUrl: string;

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
  await pool.query('DELETE FROM users WHERE email = ANY($1)', [[...createdEmails]]);
  await new Promise((resolve) => {
    server.close(resolve);
  });
  await pool.end();
});

async function seedAccount(email: string): Promise<string> {
  createdEmails.add(email);

  const { rows } = await pool.query<{ id: string }>(
    'INSERT INTO users (email) VALUES ($1) RETURNING id',
    [email],
  );

  return rows[0]?.id ?? '';
}

describe('sign-in routes', () => {
  it('sends the browser to Google with a signed state', async () => {
    const response = await fetch(`${baseUrl}/api/auth/google`, { redirect: 'manual' });

    assert.equal(response.status, 302);

    const destination = new URL(response.headers.get('location') ?? '');

    assert.equal(destination.hostname, 'accounts.google.com');
    assert.equal(destination.searchParams.get('client_id'), 'test-google-id');
    assert.equal(
      destination.searchParams.get('redirect_uri'),
      'http://localhost:3000/api/auth/google/callback',
    );
    assert.ok(destination.searchParams.get('scope')?.includes('email'), 'asks for the address');

    assert.match(destination.searchParams.get('state') ?? '', /^[0-9a-f]{32}\.[0-9a-f]{64}$/);
  });

  it('refuses a callback carrying a state it never handed out', async () => {
    const response = await fetch(`${baseUrl}/api/auth/google/callback?code=stolen&state=made-up`, {
      redirect: 'manual',
    });

    assert.equal(response.status, 302);

    const location = decodeURIComponent(response.headers.get('location') ?? '');

    assert.ok(location.startsWith('http://localhost:5173/#error='), location);
    assert.ok(location.includes('could not be confirmed'), location);
  });

  it('says which provider is not set up, rather than sending the browser nowhere', async () => {
    const response = await fetch(`${baseUrl}/api/auth/facebook`, { redirect: 'manual' });

    assert.equal(response.status, 302);

    const location = decodeURIComponent(response.headers.get('location') ?? '');

    assert.ok(location.includes('facebook sign-in is not set up'), location);
  });
});

describe('linking a provider account', () => {
  it('joins an account by its address, so an existing account keeps its history', async () => {
    const email = `oauth-join-${runId}@example.com`;
    const existingId = await seedAccount(email);

    const signedIn = await resolveOAuthUser({
      provider: 'google',
      providerId: `google-${runId}`,
      email,
    });

    assert.equal(signedIn.id, existingId);
  });

  it('lands on the same account the second time', async () => {
    const email = `oauth-again-${runId}@example.com`;
    createdEmails.add(email);

    const first = await resolveOAuthUser({
      provider: 'google',
      providerId: `google-again-${runId}`,
      email,
    });
    const second = await resolveOAuthUser({
      provider: 'google',
      providerId: `google-again-${runId}`,
      email,
    });

    assert.equal(first.id, second.id);
  });

  it('attaches a second provider to the same person', async () => {
    const email = `oauth-two-${runId}@example.com`;
    createdEmails.add(email);

    const viaGoogle = await resolveOAuthUser({
      provider: 'google',
      providerId: `google-two-${runId}`,
      email,
    });
    const viaFacebook = await resolveOAuthUser({
      provider: 'facebook',
      providerId: `facebook-two-${runId}`,
      email,
    });

    assert.equal(viaGoogle.id, viaFacebook.id);
  });

  it('creates the account under the address the provider gave', async () => {
    const email = `oauth-nopass-${runId}@example.com`;
    createdEmails.add(email);

    const user = await resolveOAuthUser({
      provider: 'google',
      providerId: `google-nopass-${runId}`,
      email,
    });

    assert.equal(user.email, email);
  });

  it('invents an address for a provider that hands over none', () => {
    assert.equal(
      accountEmail({ provider: 'twitter', providerId: '4242', email: null }),
      'twitter-4242@twitter.local',
    );

    assert.equal(
      accountEmail({ provider: 'google', providerId: '99', email: 'someone@example.com' }),
      'someone@example.com',
    );
  });
});
