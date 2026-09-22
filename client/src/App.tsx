import { useCallback, useEffect, useState } from 'react';
import { History as HistoryIcon } from 'lucide-react';
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import {
  ApiError,
  getMe,
  hasToken,
  isGuestExhausted,
  markGuestExhausted,
  setToken,
  setUnauthorizedHandler,
  type Account,
} from './api';
import { AuthPanel } from './components/AuthPanel';
import { GalleryPanel } from './components/GalleryPanel';
import { JobStatus } from './components/JobStatus';
import { UploadPanel } from './components/UploadPanel';
import { Button } from './components/ui/Button';
import { ResultsCarousel } from './components/ResultsCarousel';
import { startPolling } from './poll';
import { isRunSettled, type TransformRun } from './run';

export default function App() {
  // Sign-in is a guard on token state, not a route of its own.
  const [signedIn, setSignedIn] = useState(hasToken());
  const [expired, setExpired] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [run, setRun] = useState<TransformRun | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [guestExhausted, setGuestExhausted] = useState(isGuestExhausted());
  const navigate = useNavigate();

  // A single transform shows the job card, a batch shows the carousel, never both.
  const handleJobQueued = useCallback((jobId: string) => {
    setActiveJobId(jobId);
    setRun(null);
    setHistoryRefresh((current) => current + 1);
  }, []);

  const handleRunQueued = useCallback((next: TransformRun) => {
    setRun(next);
    setActiveJobId(null);
    setHistoryRefresh((current) => current + 1);
  }, []);

  useEffect(() => {
    if (run === null) {
      return;
    }

    return startPolling<boolean>({
      fetch: () => isRunSettled(run),
      isSettled: (settled) => settled,
      onUpdate: (settled) => {
        if (settled) {
          setHistoryRefresh((current) => current + 1);
        }
      },
      onError: (err) => {
        if (err instanceof ApiError && err.status === 404) {
          setRun(null);
        }
      },
    });
  }, [run]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setSignedIn(false);
      setActiveJobId(null);
      setRun(null);
      setAccount(null);
      setExpired(true);
    });

    return () => {
      setUnauthorizedHandler(null);
    };
  }, []);

  const applyAccount = useCallback((me: Account): void => {
    setAccount(me);

    if (me.guest && me.uploadLimit !== null && me.uploadsUsed >= me.uploadLimit) {
      markGuestExhausted();
      setGuestExhausted(true);
    }
  }, []);

  const refreshAccount = useCallback(async (): Promise<void> => {
    try {
      applyAccount(await getMe());
    } catch {
    }
  }, [applyAccount]);

  useEffect(() => {
    // Everything below this point is only reachable with a token.
    if (!signedIn) {
      return;
    }

    getMe()
      .then(applyAccount)
      .catch(() => {
      });
  }, [signedIn, applyAccount]);

  function signOut(): void {
    setToken(null);
    setSignedIn(false);
    setActiveJobId(null);
    setRun(null);
    setAccount(null);
  }

  function leaveGuestMode(): void {
    signOut();
  }

  const isGuest = account !== null && account.guest;

  const brand = (
    <div className="brand">
      <span className="wordmark">Lumina</span>
    </div>
  );

  if (!signedIn) {
    return (
      <main className="shell shell--auth">
        <header className="topbar">{brand}</header>

        <div className="auth">
          <div className="auth-card">
            {expired && <p className="notice">Your session expired. Please sign in again.</p>}

            <AuthPanel
              guestExhausted={guestExhausted}
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
      <header className="topbar">
        {brand}

        <div className="topbar-actions">
          <Link
            className="icon-btn"
            to="/history"
            title="See every image you have transformed."
          >
            <HistoryIcon size={16} strokeWidth={1.5} />
          </Link>

          {isGuest && account.uploadLimit !== null && (
            <span className="account-hint">
              Guest: {account.uploadsUsed} of {account.uploadLimit} uploads used
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

          {account !== null && account.avatarUrl !== null && (
            <img
              className="account-avatar"
              src={account.avatarUrl}
              title={account.email}
              referrerPolicy="no-referrer"
            />
          )}
        </div>
      </header>

      <Routes>
        <Route
          path="/"
          element={
            <div className="workspace">
              <UploadPanel
                onJobQueued={handleJobQueued}
                onRunQueued={handleRunQueued}
                emailable={account !== null && account.emailable}
                uploadLimit={account === null ? null : account.uploadLimit}
                onUploaded={() => {
                  void refreshAccount();
                  setHistoryRefresh((current) => current + 1);
                }}
              />

              {activeJobId !== null ? (
                <JobStatus
                  jobId={activeJobId}
                  onReady={() => setHistoryRefresh((current) => current + 1)}
                  onMissing={() => setActiveJobId(null)}
                />
              ) : (
                <ResultsCarousel refreshKey={historyRefresh} />
              )}
            </div>
          }
        />

        <Route
          path="/history"
          element={
            <div className="workspace">
              <div className="actions">
                <Button
                  variant="ghost"
                  onClick={() => navigate('/')}
                  title="Go back to the main page."
                >
                  Back
                </Button>
              </div>

              <GalleryPanel key={historyRefresh} />
            </div>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
  );
}
