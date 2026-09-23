import { useState, type FormEvent } from 'react';
import { siFacebook, siGoogle, siX, type SimpleIcon } from 'simple-icons';
import {
  authRedirectError,
  clearAuthRedirectError,
  providerSignInUrl,
  startEmailSignIn,
  type SignInProvider,
} from '../api';
import { Button } from './ui/Button';
import { Panel } from './ui/Panel';

const PROVIDERS: Array<{ id: SignInProvider; label: string; icon: SimpleIcon }> = [
  { id: 'google', label: 'Google', icon: siGoogle },
  { id: 'facebook', label: 'Facebook', icon: siFacebook },
  { id: 'twitter', label: 'Twitter', icon: siX },
];

export function AuthPanel() {
  const [error, setError] = useState<string | null>(authRedirectError());
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [manualLink, setManualLink] = useState<string | null>(null);

  function clearError(): void {
    clearAuthRedirectError();
    setError(null);
  }

  async function handleEmail(event: FormEvent): Promise<void> {
    event.preventDefault();
    clearError();
    setBusy(true);

    try {
      const result = await startEmailSignIn(email.trim());
      setSentTo(email.trim());
      setManualLink(result.signInUrl ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the sign in link');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Sign in" lede="Have a link emailed to you, or use an account.">
      {error !== null && <p className="notice">{error}</p>}

      {sentTo === null ? (
        <form className="auth-email" onSubmit={(event) => void handleEmail(event)}>
          <div className="field">
            <label className="field-label" htmlFor="signin-email">
              Email address
            </label>

            <input
              id="signin-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              placeholder="you@example.com"
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            disabled={busy}
            title="Email a link that signs you in once."
          >
            Email me a sign in link
          </Button>
        </form>
      ) : (
        <div className="auth-email">
          <p className="auth-alt">
            Check {sentTo} for the link. It works once and expires in 15 minutes.
          </p>

          {manualLink !== null && (
            <p className="auth-alt">
              <a href={manualLink}>Open the link now</a>
            </p>
          )}

          <Button
            variant="link"
            onClick={() => {
              setSentTo(null);
              setManualLink(null);
            }}
          >
            Use a different address
          </Button>
        </div>
      )}

      <p className="auth-alt">or continue with</p>

      <div className="auth-providers">
        {PROVIDERS.map((provider) => (
          <Button
            key={provider.id}
            variant="outline"
            disabled={busy}
            title={`Sign in with your ${provider.label} account. No password to remember, and the account is real.`}
            onClick={() => {
              window.location.href = providerSignInUrl(provider.id);
            }}
          >
            <svg className="brand-icon" viewBox="0 0 24 24">
              <path d={provider.icon.path} />
            </svg>
            {provider.label}
          </Button>
        ))}
      </div>
    </Panel>
  );
}
