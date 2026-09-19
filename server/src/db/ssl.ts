export type DatabaseSsl = boolean | { rejectUnauthorized: boolean } | undefined;

const SSL_MODES: Record<string, DatabaseSsl> = {
  disable: false,
  // libpq reads these as "encrypt, but do not check the certificate".
  require: { rejectUnauthorized: false },
  'no-verify': { rejectUnauthorized: false },
  // These ask for the certificate to be checked against the trust store.
  'verify-ca': { rejectUnauthorized: true },
  'verify-full': { rejectUnauthorized: true },
};

/**
 * Turns the `sslmode` in a connection string into the option the driver wants.
 *
 * Postgres defines `require` as "encrypt the connection, but do not check the
 * certificate". The connection-string parser reads both `require` and
 * `verify-full` as "encrypt and check", so a hosted database that asks for
 * `require` - Neon and Supabase both do - is held to a stricter test than it
 * asked for, and fails with a certificate error that never mentions sslmode.
 * Reading the setting here keeps the two meanings apart.
 *
 * Anything unrecognised, including no setting at all, is left alone so a local
 * database still connects without encryption.
 */
export function sslOptionFor(url: string): DatabaseSsl {
  return SSL_MODES[readSslMode(url) ?? ''] ?? undefined;
}

function readSslMode(url: string): string | undefined {
  try {
    const mode = new URL(url).searchParams.get('sslmode');

    return mode === null ? undefined : mode.trim().toLowerCase();
  } catch {
    // Not a url we can read. The driver will produce a clearer complaint.
    return undefined;
  }
}
