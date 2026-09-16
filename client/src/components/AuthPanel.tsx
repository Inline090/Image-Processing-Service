import { useState, type FormEvent } from 'react';
import { login, register } from '../api';

type Mode = 'login' | 'register';

type Props = {
  onSignedIn: () => void;
};

export function AuthPanel({ onSignedIn }: Props) {
  const [mode, setMode] = useState<Mode>('login');
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

  function toggleMode(): void {
    setMode(mode === 'login' ? 'register' : 'login');
    setError(null);
  }

  return (
    <section className="panel">
      <h2>{mode === 'login' ? 'Sign in' : 'Create an account'}</h2>

      <form onSubmit={handleSubmit}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            required
          />
        </label>

        <button type="submit" disabled={busy}>
          {busy ? 'Working...' : mode === 'login' ? 'Sign in' : 'Sign up'}
        </button>
      </form>

      {error !== null && <p className="error">{error}</p>}

      <button type="button" className="link" onClick={toggleMode}>
        {mode === 'login' ? 'Need an account? Register' : 'Already registered? Sign in'}
      </button>
    </section>
  );
}
