export type DatabaseSsl = boolean | { rejectUnauthorized: boolean } | undefined;

const SSL_MODES: Record<string, DatabaseSsl> = {
  disable: false,
  require: { rejectUnauthorized: false },
  'no-verify': { rejectUnauthorized: false },
  'verify-ca': { rejectUnauthorized: true },
  'verify-full': { rejectUnauthorized: true },
};

// Supabase and Neon send sslmode=require, which means encrypt but do not check the certificate.
export function sslOptionFor(url: string): DatabaseSsl {
  return SSL_MODES[readSslMode(url) ?? ''] ?? undefined;
}

// pg parses sslmode itself and, since pg-connection-string 2.6, reads "require" as
// "verify-full" - which rejects the pooled Supabase certificate with a self-signed
// error. The mode is decided above instead, so it is stripped before pg sees it.
export function connectionStringFor(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('sslmode');

    return parsed.toString();
  } catch {
    return url;
  }
}

function readSslMode(url: string): string | undefined {
  try {
    const mode = new URL(url).searchParams.get('sslmode');

    return mode === null ? undefined : mode.trim().toLowerCase();
  } catch {
    return undefined;
  }
}
