import { useState } from 'react';
import { hasToken, setToken } from './api';
import { AuthPanel } from './components/AuthPanel';
import { UploadPanel } from './components/UploadPanel';

export default function App() {
  const [signedIn, setSignedIn] = useState(hasToken());

  function signOut(): void {
    setToken(null);
    setSignedIn(false);
  }

  return (
    <main>
      <header>
        <h1>Image Processing Service</h1>
        {signedIn && (
          <button type="button" className="link" onClick={signOut}>
            Sign out
          </button>
        )}
      </header>

      {signedIn ? <UploadPanel /> : <AuthPanel onSignedIn={() => setSignedIn(true)} />}
    </main>
  );
}
