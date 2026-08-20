import { useFirebaseAuth } from "@/_core/hooks/useFirebaseAuth";
import { isInAppBrowser, signInWithGoogle } from "@/lib/firebase";
import { clearAfterLogin, rememberAfterLogin } from "@/lib/authRedirect";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Google sign-in did not finish. Please choose your account again.";
}

export default function SignIn() {
  const { isAuthenticated, loading, configured } = useFirebaseAuth();
  const [, setLocation] = useLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inAppBrowser = isInAppBrowser();

  useEffect(() => {
    if (!loading && isAuthenticated) {
      clearAfterLogin();
      setLocation("/interview");
    }
  }, [isAuthenticated, loading, setLocation]);

  const continueWithGoogle = async () => {
    if (loading || busy) return;
    if (!configured) {
      setError("Firebase is not configured for this deployment. Add the Firebase variables in Render and redeploy.");
      return;
    }
    if (inAppBrowser) {
      setError("This in-app browser cannot complete Google sign-in. Open seekhao in Chrome or Safari and try again.");
      return;
    }

    setBusy(true);
    setError(null);
    rememberAfterLogin("/interview");
    try {
      const signedInUser = await signInWithGoogle();
      if (signedInUser) {
        clearAfterLogin();
        setLocation("/interview");
      }
    } catch (signInError) {
      clearAfterLogin();
      setError(errorMessage(signInError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="dusk-page grid min-h-screen place-items-center px-5 py-10">
      <div className="w-full max-w-md">
        <button onClick={() => setLocation("/")} className="mb-6 inline-flex items-center gap-2 text-sm text-white/55 transition hover:text-white">
          <ArrowLeft className="h-4 w-4" /> back to seekhao
        </button>
        <div className="glass-panel rounded-[2rem] p-3">
          <div className="gradient-card overflow-hidden rounded-[1.6rem] p-8 text-center text-white sm:p-10">
            <span className="seekhao-wordmark text-4xl font-medium">seekhao</span>
            <div className="mx-auto mt-8 flex h-10 items-end justify-center gap-1.5">
              {[16, 28, 38, 21, 34, 14, 29].map((height, index) => <span className="wave-bar w-1.5 rounded-full bg-white" style={{ height }} key={index} />)}
            </div>
            <p className="mt-7 text-sm text-white/68">your practice room is ready</p>
            <h1 className="mt-2 text-3xl tracking-[-.06em]">sign in to continue.</h1>
            <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-white/58">Use your Google account to open your interview practice room and continue to the setup questions.</p>
            <button onClick={continueWithGoogle} disabled={loading || busy} className="mt-7 inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-medium text-[#111111] disabled:cursor-wait disabled:opacity-60">
              {busy ? "opening Google…" : loading ? "checking access…" : "continue with Google"}
              {!busy && !loading && <ArrowUpRight className="h-4 w-4" />}
            </button>
            {error && <p role="alert" className="mx-auto mt-5 max-w-sm rounded-2xl border border-red-200/20 bg-red-950/25 px-4 py-3 text-left text-xs leading-relaxed text-red-100">{error}</p>}
            <p className="mt-7 text-xs leading-relaxed text-white/38">No password is stored by seekhao. Firebase handles the Google authentication session.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
