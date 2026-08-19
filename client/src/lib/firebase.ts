import { getApp, getApps, initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  type User,
} from "firebase/auth";

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

// The Google OAuth client id used by this Firebase project (seen in OAuth
// request URLs: client_id=217420754231-nj6e0supa2n15fpb2193erm41sr0g6vc).
const GOOGLE_CLIENT_ID = "217420754231-nj6e0supa2n15fpb2193erm41sr0g6vc.apps.googleusercontent.com";

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

type GisPrompt = {
  isNotDisplayed?: () => boolean;
  isSkippedMoment?: () => boolean;
  isDismissedMoment?: () => boolean;
};

function castPrompt(notification: unknown): GisPrompt | undefined {
  return notification && typeof notification === "object" ? (notification as GisPrompt) : undefined;
}

// ---------- Google Identity Services (GIS) bridge ----------
// GIS is loaded from https://accounts.google.com/gsi/client and runs its OAuth
// flow inside an iframe/dialog controlled by Google itself — no popup window,
// no firebaseapp.com redirect, so it works in mobile browsers and in-app
// webviews (WhatsApp, Instagram, Facebook) where popups get blocked.

let gisScriptPromise: Promise<void> | null = null;

// Matches the Window augmentation in client/src/components/Map.tsx so both
// files agree on the type of window.google.
declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (options: Record<string, unknown>) => void;
          prompt: (callback?: unknown) => void;
        };
      };
    };
  }
}

type GisAccounts = {
  id?: {
    initialize: (options: Record<string, unknown>) => void;
    prompt: (callback?: unknown) => void;
  };
};

function gis(): GisAccounts | undefined {
  return window.google?.accounts as GisAccounts | undefined;
}

function loadGisScript(): Promise<void> {
  if (gis()?.id) return Promise.resolve();
  if (gisScriptPromise) return gisScriptPromise;
  gisScriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("google identity script failed to load"));
    document.head.appendChild(script);
  });
  return gisScriptPromise;
}

// Returns the Google id_token from GIS, or null if the user dismisses the
// Google prompt / GIS is unavailable (e.g. script blocked).
function signInWithGoogleIdentity(): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    loadGisScript()
      .then(() => {
        const accounts = gis();
        if (!accounts?.id) { resolve(null); return; }
        let resolved = false;
        accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response: { credential?: string }) => {
            if (resolved) return;
            resolved = true;
            resolve(response?.credential ?? null);
          },
          auto_select: false,
          // Suppress the automatic one-tap bar so we stay in control of UX.
          context: "signin",
        });
        // Show the Google account chooser as a dialog (works in webviews).
        accounts.id.prompt((notification: unknown) => {
          // If Google dismisses the prompt without any credential (user closed
          // it, or GIS not available in this browser), treat as cancelled.
          const n = castPrompt(notification);
          if (n?.isNotDisplayed?.()) { if (!resolved) { resolved = true; resolve(null); } }
          else if (n?.isSkippedMoment?.()) { if (!resolved) { resolved = true; resolve(null); } }
        });
        // Safety timeout — GIS can hang silently in some webviews.
        setTimeout(() => {
          if (!resolved) { resolved = true; resolve(null); }
        }, 60000);
      })
      .catch(() => resolve(null));
  });
}

let redirectSignInPending = false;

export async function signInWithGoogle() {
  // 1. Prefer Google Identity Services on mobile / in-app webviews: it needs
  //    no popup and never touches firebaseapp.com (which 404s because the
  //    Firebase project has no Hosting site enabled).
  if (isPopupLikelyBlocked()) {
    const idToken = await signInWithGoogleIdentity();
    if (idToken) {
      try {
        await signInWithCredential(auth(), GoogleAuthProvider.credential(idToken));
        // Confirm Firebase actually persisted the user before declaring success.
        if (auth().currentUser) return;
        throw new Error("firebase did not persist the google session");
      } catch (error) {
        // GIS promised a credential but Firebase rejected it (e.g. the Google
        // client isn't enabled in Firebase's sign-in providers). Surface the
        // real cause instead of silently falling through to popup/redirect,
        // which are guaranteed to fail in an in-app webview anyway.
        console.error("[seekhao] GIS sign-in failed", error);
        throw error instanceof Error ? error : new Error(String(error));
      }
    }
    // GIS unavailable or dismissed — fall through to popup, then redirect.
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  try {
    await signInWithPopup(auth(), provider);
    return;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("popup-closed-by-user") || message.includes("cancelled-popup-request")) return;
    // Popup blocked or failed — fall back to redirect mode.
    redirectSignInPending = true;
    await signInWithRedirect(auth(), provider);
  }
}

// Called once after the app mounts so a pending redirect-based sign-in can
// complete and restore the Firebase session (desktop popup-fallback path).
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
