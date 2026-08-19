import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { firebaseIsConfigured, finishRedirectSignIn, observeFirebaseUser } from "@/lib/firebase";

export function useFirebaseAuth() {
  const [user, setUser] = useState<User | null>(null);
  // loading stays true until Firebase's persistence restore completes its
  // first onAuthStateChanged callback (null or a user) — without this, a
  // mid-sign-in navigation briefly renders the "sign in" card even though
  // the session was already accepted, which looked like a login loop on mobile.
  const [loading, setLoading] = useState(firebaseIsConfigured);
  const resolvedOnce = useRef(false);
  const finishedRedirect = useRef(false);
  const authStateResolved = useRef(!firebaseIsConfigured);
  const redirectResolved = useRef(!firebaseIsConfigured);
  const finishInitialAuth = () => {
    if (authStateResolved.current && redirectResolved.current) setLoading(false);
  };
  useEffect(() => {
    const unsubscribe = observeFirebaseUser(nextUser => {
      setUser(nextUser);
      authStateResolved.current = true;
      if (!resolvedOnce.current) resolvedOnce.current = true;
      // A restored user is enough to show the authenticated app immediately;
      // otherwise wait for getRedirectResult before treating null as final.
      if (nextUser) setLoading(false);
      else finishInitialAuth();
    });
    return unsubscribe;
  }, []);
  // Mobile / in-app-webview sign-ins use redirect mode (popups are blocked
  // there). Resolve the pending redirect exactly once per mount.
  useEffect(() => {
    if (finishedRedirect.current || !firebaseIsConfigured) return;
    finishedRedirect.current = true;
    void finishRedirectSignIn()
      .then(redirectUser => {
        if (redirectUser) setUser(redirectUser);
      })
      .finally(() => {
        redirectResolved.current = true;
        finishInitialAuth();
      });
  }, []);
  return { user, loading, isAuthenticated: Boolean(user), configured: firebaseIsConfigured };
}
