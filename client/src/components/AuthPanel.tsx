import { useState, type FormEvent } from 'react';
import { login, register, signInAsGuest } from '../api';
import { Button } from './ui/Button';
import { Field } from './ui/Field';
import { Panel } from './ui/Panel';

export type AuthMode = 'login' | 'register';

type Props = {
  mode: AuthMode;
  /** True once this browser has spent the guest allowance. */
  guestExhausted: boolean;
  onModeChange: (mode: AuthMode) => void;
  onSignedIn: () => void;
};

export function AuthPanel({ mode, guestExhausted, onModeChange, onSignedIn }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      if (mode === 'register') {
        await register(email, password);
      }

      await login(email, password);
      onSignedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  async function handleGuest(): Promise<void> {
    setError(null);
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

  function toggleMode(): void {
    onModeChange(mode === 'login' ? 'register' : 'login');
    setEmail('');
    setPassword('');
    setError(null);
  }

  return (
    <Panel
      title={mode === 'login' ? 'Sign in' : 'Create an account'}
      lede={
        mode === 'login'
          ? 'Enter your details to continue.'
          : 'Choose an email and a password of at least eight characters.'
      }
    >
      <form onSubmit={handleSubmit}>
        <div className="group">
          <Field label="Email" hideLabel>
            <input
              type="email"
              placeholder="Enter email"
              title="The email address on your account."
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </Field>

          <Field label="Password" hideLabel>
            <input
              type="password"
              placeholder="Password"
              title="Your password. At least eight characters."
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              required
            />
          </Field>
        </div>

        {error !== null && <p className="notice">{error}</p>}

        <Button
          type="submit"
          variant="primary"
          disabled={busy}
          title={mode === 'login' ? 'Sign in to your account.' : 'Create the account and sign in.'}
        >
          {busy ? 'Working...' : mode === 'login' ? 'Sign in' : 'Sign up'}
        </Button>

        <div className="divider">Or Continue as</div>

        <div className="auth-guest">
          {guestExhausted ? (
            <p className="auth-alt">
              Guest uploads are used up on this browser. Create an account to keep going.
            </p>
          ) : (
            <Button
              variant="link"
              disabled={busy}
              title="Start a temporary session. It allows a set number of uploads, once."
              onClick={() => void handleGuest()}
            >
              Guest
            </Button>
          )}
        </div>

        <p className="auth-alt">
          {mode === 'login' ? "Don't have an account? " : 'Already registered? '}
          <Button
            variant="link"
            title={mode === 'login' ? 'Create an account instead.' : 'Sign in instead.'}
            onClick={toggleMode}
          >
            {mode === 'login' ? 'Register' : 'Sign in'}
          </Button>
        </p>
      </form>
    </Panel>
  );
}
