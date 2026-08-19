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
  useEffect(() => {
    const unsubscribe = observeFirebaseUser(nextUser => {
      console.log("[seekhao][auth] onAuthStateChanged", nextUser);
      setUser(nextUser);
      if (!resolvedOnce.current) { resolvedOnce.current = true; setLoading(false); }
    });
    return unsubscribe;
  }, []);
  // Mobile / in-app-webview sign-ins use redirect mode (popups are blocked
  // there). Resolve the pending redirect exactly once per mount.
  useEffect(() => {
    if (finishedRedirect.current || !firebaseIsConfigured) return;
    finishedRedirect.current = true;
    void finishRedirectSignIn();
  }, []);
  return { user, loading, isAuthenticated: Boolean(user), configured: firebaseIsConfigured };
}
