import { useState } from 'react';
import { hasToken, setToken } from './api';
import { AuthPanel } from './components/AuthPanel';
import { GalleryPanel } from './components/GalleryPanel';
import { JobStatus } from './components/JobStatus';
import { UploadPanel } from './components/UploadPanel';

export default function App() {
  const [signedIn, setSignedIn] = useState(hasToken());
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

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
        <AuthPanel onSignedIn={() => setSignedIn(true)} />
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
