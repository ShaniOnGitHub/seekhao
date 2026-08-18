import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, getRedirectResult, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, type User } from "firebase/auth";

function isPopupLikelyBlocked(): boolean {
  if (typeof navigator !== "undefined" && navigator.userAgent) {
    const agent = navigator.userAgent.toLowerCase();
    if (agent.includes("mobile") || agent.includes("android") || /iphone|ipad|ipod/.test(agent)) return true;
  }
  // In-app browsers (WhatsApp, Instagram, Facebook webviews) cannot open
  // popup windows reliably — detect by missing window.open support.
  if (typeof window !== "undefined" && !window.open) return true;
  return false;
}

let redirectSignInPending = false;

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseIsConfigured = Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);

function auth() {
  if (!firebaseIsConfigured) throw new Error("firebase is not configured yet");
  const app = getApps().length ? getApp() : initializeApp(config);
  return getAuth(app);
}

export function observeFirebaseUser(listener: (user: User | null) => void) {
  if (!firebaseIsConfigured) { listener(null); return () => undefined; }
  return onAuthStateChanged(auth(), listener);
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  // Mobile browsers and in-app webviews (WhatsApp, Instagram, Facebook)
  // cannot open popup windows, which shows a raw firebaseapp.com error
  // page. Redirect mode navigates the same tab and works everywhere.
  if (isPopupLikelyBlocked()) {
    redirectSignInPending = true;
    await signInWithRedirect(auth(), provider);
    return;
  }

  try {
    await signInWithPopup(auth(), provider);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("popup-closed-by-user") || message.includes("cancelled-popup-request")) return;
    // Popup blocked or failed — fall back to redirect mode.
    redirectSignInPending = true;
    await signInWithRedirect(auth(), provider);
  }
}

// Called once after the app mounts so a pending in-app-webview redirect
// sign-in can complete and restore the Firebase session.
export async function finishRedirectSignIn(): Promise<User | null> {
  if (!redirectSignInPending) return null;
  redirectSignInPending = false;
  try {
    const result = await getRedirectResult(auth());
    return result?.user ?? null;
  } catch {
    return null;
  }
}

export async function signOutOf() { await auth().signOut(); }
