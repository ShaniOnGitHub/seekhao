import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { firebaseIsConfigured, finishRedirectSignIn, observeFirebaseUser } from "@/lib/firebase";

export function useFirebaseAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(firebaseIsConfigured);
  const finishedRedirect = useRef(false);
  useEffect(() => {
    const unsubscribe = observeFirebaseUser(nextUser => { setUser(nextUser); setLoading(false); });
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
