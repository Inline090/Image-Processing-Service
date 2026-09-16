import { useEffect, useState } from 'react';
import { hasToken, setToken, setUnauthorizedHandler } from './api';
import { AuthPanel } from './components/AuthPanel';
import { GalleryPanel } from './components/GalleryPanel';
import { JobStatus } from './components/JobStatus';
import { UploadPanel } from './components/UploadPanel';

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
      <main>
        <header>
          <h1>Image Processing Service</h1>
        </header>

        {expired && <p className="error">Your session expired - please sign in again.</p>}

        <AuthPanel
          onSignedIn={() => {
            setSignedIn(true);
            setExpired(false);
          }}
        />
      </main>
    );
  }

  return (
    <main>
      <header>
        <h1>Image Processing Service</h1>
        <button type="button" className="link" onClick={signOut}>
          Sign out
        </button>
      </header>

      <UploadPanel onJobQueued={setActiveJobId} />
      {activeJobId !== null && <JobStatus jobId={activeJobId} />}
      <GalleryPanel />
    </main>
  );
}
