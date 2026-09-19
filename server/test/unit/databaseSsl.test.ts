import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Pool } from 'pg';
import { sslOptionFor } from '../../src/db/ssl.js';

describe('database ssl', () => {
  it('leaves a local url unencrypted', () => {
    assert.equal(sslOptionFor('postgres://ips:ips@localhost:5432/image_processing'), undefined);
  });

  it('encrypts without checking the certificate when the mode says require', () => {
    // The reason this module exists: Postgres reads `require` as "encrypt only",
    // while the connection-string parser reads it as "encrypt and verify", so a
    // hosted database ends up held to a test it never asked for.
    assert.deepEqual(sslOptionFor('postgres://u:p@host/db?sslmode=require'), {
      rejectUnauthorized: false,
    });
  });

  it('checks the certificate when the mode asks for that', () => {
    assert.deepEqual(sslOptionFor('postgres://u:p@host/db?sslmode=verify-full'), {
      rejectUnauthorized: true,
    });
    assert.deepEqual(sslOptionFor('postgres://u:p@host/db?sslmode=verify-ca'), {
      rejectUnauthorized: true,
    });
  });

  it('can turn encryption off altogether', () => {
    assert.equal(sslOptionFor('postgres://u:p@host/db?sslmode=disable'), false);
  });

  it('ignores a mode it does not know, and a url it cannot read', () => {
    assert.equal(sslOptionFor('postgres://u:p@host/db?sslmode=prefer'), undefined);
    assert.equal(sslOptionFor('postgres://u:p@host/db?sslmode=anything'), undefined);
    assert.equal(sslOptionFor('not a url'), undefined);
  });

  it('beats the mode written in the url, which is what the pool relies on', () => {
    const url = 'postgres://u:p@host/db?sslmode=require';
    const pool = new Pool({ connectionString: url, ssl: sslOptionFor(url) });

    assert.deepEqual(pool.options.ssl, { rejectUnauthorized: false });

    void pool.end();
  });
});
