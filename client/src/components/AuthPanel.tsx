import { useState } from 'react';
import { siFacebook, siGoogle, siX, type SimpleIcon } from 'simple-icons';
import {
  authRedirectError,
  clearAuthRedirectError,
  providerSignInUrl,
  signInAsGuest,
  type SignInProvider,
} from '../api';
import { Button } from './ui/Button';
import { Panel } from './ui/Panel';

const PROVIDERS: Array<{ id: SignInProvider; label: string; icon: SimpleIcon }> = [
  { id: 'google', label: 'Google', icon: siGoogle },
  { id: 'facebook', label: 'Facebook', icon: siFacebook },
  { id: 'twitter', label: 'Twitter', icon: siX },
];

type Props = {

  guestExhausted: boolean;
  onSignedIn: () => void;
};

export function AuthPanel({ guestExhausted, onSignedIn }: Props) {
  const [error, setError] = useState<string | null>(authRedirectError());
  const [busy, setBusy] = useState(false);

  function clearError(): void {
    clearAuthRedirectError();
    setError(null);
  }

  async function handleGuest(): Promise<void> {
    clearError();
    setBusy(true);

    try {
      await signInAsGuest();
      onSignedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start a guest session');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Sign in" lede="Choose an account to continue, or carry on as a guest.">
      {error !== null && <p className="notice">{error}</p>}

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

      <div className="auth-guest">
        {guestExhausted ? (
          <p className="auth-alt">
            Guest uploads are used up on this browser. Sign in with one of the accounts above to
            keep going.
          </p>
        ) : (
          <Button
            variant="link"
            disabled={busy}
            title="Start a temporary session. It allows a set number of uploads, once."
            onClick={() => void handleGuest()}
          >
            or continue as guest
          </Button>
        )}
      </div>
    </Panel>
  );
}
