import { useCallback, useEffect, useState } from 'react';
import {
  getMe,
  hasToken,
  isGuestExhausted,
  markGuestExhausted,
  setToken,
  setUnauthorizedHandler,
  type Account,
} from './api';
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
  const [account, setAccount] = useState<Account | null>(null);
  // Raised when a transform finishes, so the history can re-fetch and show it.
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [guestExhausted, setGuestExhausted] = useState(isGuestExhausted());

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setSignedIn(false);
      setActiveJobId(null);
      setAccount(null);
      setExpired(true);
    });

    return () => {
      setUnauthorizedHandler(null);
    };
  }, []);

  // A spent allowance is worth remembering outside the session: without this,
  // leaving guest mode and starting a new guest session would hand out a fresh
  // set of uploads.
  const applyAccount = useCallback((me: Account): void => {
    setAccount(me);

    if (me.guest && me.uploadLimit !== null && me.uploadsUsed >= me.uploadLimit) {
      markGuestExhausted();
      setGuestExhausted(true);
    }
  }, []);

  /**
   * Re-reads the account. A guest's allowance is spent server-side by each
   * upload, so the count has to be fetched again rather than incremented here.
   */
  const refreshAccount = useCallback(async (): Promise<void> => {
    try {
      applyAccount(await getMe());
    } catch {
      // A 401 has already triggered the shared sign-out handler above. Anything
      // else leaves the hint off rather than blocking the page.
    }
  }, [applyAccount]);

  // A guest session is indistinguishable from a registered one after a reload —
  // only the token survives — so the account type is fetched rather than
  // remembered.
  useEffect(() => {
    if (!signedIn) {
      return;
    }

    getMe()
      .then(applyAccount)
      .catch(() => {
        // As above: the shared sign-out handler has already dealt with a 401.
      });
  }, [signedIn, applyAccount]);

  function signOut(): void {
    setToken(null);
    setSignedIn(false);
    setActiveJobId(null);
    setAccount(null);
  }

  // A guest has no credentials to stay signed in with, so the action they need
  // is the way back to the sign-in card, not a sign-out.
  function leaveGuestMode(): void {
    signOut();
  }

  const isGuest = account !== null && account.guest;

  const brand = (
    <div className="brand">
      <img className="brand-mark" src={logo} alt="" />
      <span className="brand-text">
        <span className="wordmark">Lumina</span>
        <span className="brand-sub">Photo Editor</span>
      </span>
    </div>
  );

  if (!signedIn) {
    return (
      <main className="shell shell--auth">
        <header className="topbar">{brand}</header>

        <div className="auth">
          <div className="auth-card">
            {expired && <p className="notice">Your session expired - please sign in again.</p>}

            <AuthPanel
              guestExhausted={guestExhausted}
              onSignedIn={() => {
                setSignedIn(true);
                setExpired(false);
              }}
            />
          </div>

          <p className="auth-footer">&copy; 2026 Lumina</p>
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="topbar">
        {brand}

        <div className="topbar-actions">
          {isGuest && account.uploadLimit !== null && (
            <span className="account-hint">
              Guest &middot; {account.uploadsUsed} of {account.uploadLimit} uploads used
            </span>
          )}

          {isGuest ? (
            <Button
              variant="ghost"
              onClick={leaveGuestMode}
              title="Leave the guest session and sign in with an account."
            >
              Sign in
            </Button>
          ) : (
            <Button variant="ghost" onClick={signOut} title="Sign out of this account.">
              Sign out
            </Button>
          )}
        </div>
      </header>

      <div className="workspace">
        <UploadPanel onJobQueued={setActiveJobId} onUploaded={() => void refreshAccount()} />
        {activeJobId !== null && (
          <JobStatus
            jobId={activeJobId}
            onReady={() => setHistoryRefresh((current) => current + 1)}
          />
        )}
        <GalleryPanel key={historyRefresh} />
      </div>
    </main>
  );
}
