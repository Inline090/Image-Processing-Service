import { useEffect, useState } from 'react';
import { hasToken, setToken, setUnauthorizedHandler } from './api';
import logo from './assets/logo.png';
import { AuthPanel } from './components/AuthPanel';
import { GalleryPanel } from './components/GalleryPanel';
import { JobStatus } from './components/JobStatus';
import { UploadPanel } from './components/UploadPanel';
import { Button } from './components/ui/Button';

export default function App() {
  const [signedIn, setSignedIn] = useState(hasToken());
  const [expired, setExpired] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setSignedIn(false);
      setActiveJobId(null);
      setExpired(true);
    });

    return () => {
      setUnauthorizedHandler(null);
    };
  }, []);

  function signOut(): void {
    setToken(null);
    setSignedIn(false);
    setActiveJobId(null);
  }

  if (!signedIn) {
    return (
      <main className="shell">
        <div className="auth glow">
          <header className="auth-intro">
            <img className="auth-mark" src={logo} alt="" />
            <p className="small-caps">Image Editor</p>
            <h1 className="auth-brand">Lumina</h1>
          </header>

          {expired && <p className="notice">Your session expired - please sign in again.</p>}

          <div className="auth-card">
            <AuthPanel
              onSignedIn={() => {
                setSignedIn(true);
                setExpired(false);
              }}
            />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="shell-header">
        <div className="brand">
          <img className="brand-mark" src={logo} alt="" />
          <h1 className="wordmark">Lumina</h1>
        </div>

        <Button variant="ghost" onClick={signOut}>
          Sign out
        </Button>
      </header>

      <UploadPanel onJobQueued={setActiveJobId} />
      {activeJobId !== null && <JobStatus jobId={activeJobId} />}
      <GalleryPanel />
    </main>
  );
}
