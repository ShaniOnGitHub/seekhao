import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { firebaseIsConfigured, observeFirebaseUser } from "@/lib/firebase";

export function useFirebaseAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(firebaseIsConfigured);
  useEffect(() => {
    const unsubscribe = observeFirebaseUser(nextUser => { setUser(nextUser); setLoading(false); });
    return unsubscribe;
  }, []);
  return { user, loading, isAuthenticated: Boolean(user), configured: firebaseIsConfigured };
}
