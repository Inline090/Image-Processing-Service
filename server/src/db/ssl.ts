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

function readSslMode(url: string): string | undefined {
  try {
    const mode = new URL(url).searchParams.get('sslmode');

    return mode === null ? undefined : mode.trim().toLowerCase();
  } catch {
    return undefined;
  }
}
