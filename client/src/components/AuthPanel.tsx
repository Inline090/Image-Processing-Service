import { useState, type FormEvent } from 'react';
import { login, register } from '../api';
import { Button } from './ui/Button';
import { Field } from './ui/Field';
import { Panel } from './ui/Panel';

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
    setEmail('');
    setPassword('');
    setError(null);
  }

  return (
    <Panel title={mode === 'login' ? 'Sign in' : 'Create an account'} accentTop>
      <form onSubmit={handleSubmit}>
        <div className="group">
          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </Field>

          <Field label="Password">
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              required
            />
          </Field>
        </div>

        {error !== null && <p className="notice">{error}</p>}

        <div className="group">
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Working...' : mode === 'login' ? 'Sign in' : 'Sign up'}
          </Button>

          <Button variant="ghost" onClick={toggleMode}>
            {mode === 'login' ? 'Need an account? Register' : 'Already registered? Sign in'}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
