import { getApp, getApps, initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  browserSessionPersistence,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  inMemoryPersistence,
  signInWithCredential,
  signInWithPopup,
  type User,
} from "firebase/auth";

function isPopupLikelyBlocked(): boolean {
  if (typeof navigator !== "undefined" && navigator.userAgent) {
    const agent = navigator.userAgent.toLowerCase();
    if (agent.includes("mobile") || agent.includes("android") || /iphone|ipad|ipod/.test(agent)) return true;
  }
  if (typeof window !== "undefined" && !window.open) return true;
  return false;
}

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

type GisIdentity = {
  initialize: (options: {
    client_id: string;
    callback: (response: { credential?: string }) => void;
    auto_select?: boolean;
    context?: string;
  }) => void;
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
};

function gis(): GisIdentity | undefined {
  const browserWindow = window as unknown as { google?: { accounts?: { id?: GisIdentity } } };
  return browserWindow.google?.accounts?.id;
}

let gisScriptPromise: Promise<void> | null = null;

function loadGisScript(): Promise<void> {
  if (gis()) return Promise.resolve();
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

function createGoogleButtonOverlay(): { host: HTMLDivElement; button: HTMLDivElement; close: HTMLButtonElement } {
  const host = document.createElement("div");
  host.setAttribute("data-seekhao-google-auth", "true");
  host.style.cssText = [
    "position:fixed", "inset:0", "z-index:2147483647", "display:flex", "align-items:center", "justify-content:center",
    "padding:24px", "background:rgba(17,13,13,.82)", "backdrop-filter:blur(14px)", "font-family:system-ui,sans-serif",
  ].join(";");
  host.innerHTML = `
    <div style="width:min(100%,380px);border:1px solid rgba(255,255,255,.18);border-radius:24px;padding:28px;background:linear-gradient(145deg,#3a2a2e,#171313);color:#f7f7f7;box-shadow:0 24px 80px rgba(0,0,0,.45)">
      <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:rgba(247,247,247,.58)">seekhao</div>
      <div style="margin-top:10px;font-size:25px;line-height:1.1">continue with Google</div>
      <div style="margin-top:10px;font-size:14px;line-height:1.5;color:rgba(247,247,247,.62)">Choose an account to open your interview practice room.</div>
      <div data-seekhao-google-button style="display:flex;justify-content:center;min-height:44px;margin-top:24px"></div>
      <button type="button" data-seekhao-google-close style="display:block;width:100%;margin-top:16px;border:0;background:transparent;color:rgba(247,247,247,.58);font-size:14px;cursor:pointer">cancel</button>
    </div>`;
  const button = host.querySelector<HTMLDivElement>("[data-seekhao-google-button]");
  const close = host.querySelector<HTMLButtonElement>("[data-seekhao-google-close]");
  if (!button || !close) throw new Error("could not create google sign-in dialog");
  return { host, button, close };
}

/**
 * Mobile/in-app browsers use the explicit GIS button rather than the GIS One Tap
 * prompt. The prompt can be skipped or leave a blank iframe when storage is
 * partitioned; the rendered button gives Google a real user gesture and always
 * reports a credential through its callback.
 */
function signInWithGoogleIdentityButton(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let overlay: ReturnType<typeof createGoogleButtonOverlay> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    const finish = (error?: Error, token?: string) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      overlay?.host.remove();
      if (error) reject(error); else if (token) resolve(token); else reject(new Error("google did not return an account credential"));
    };
    loadGisScript()
      .then(() => {
        const identity = gis();
        if (!identity) { finish(new Error("google identity sign-in is unavailable in this browser")); return; }
        overlay = createGoogleButtonOverlay();
        document.body.appendChild(overlay.host);
        overlay.close.addEventListener("click", () => finish(new Error("google sign-in was cancelled")), { once: true });
        identity.initialize({
          client_id: GOOGLE_CLIENT_ID,
          auto_select: false,
          context: "signin",
          callback: response => {
            if (response?.credential) finish(undefined, response.credential);
            else finish(new Error("google returned no account credential"));
          },
        });
        identity.renderButton(overlay.button, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "pill",
          width: 280,
          logo_alignment: "left",
        });
        timer = setTimeout(() => finish(new Error("google sign-in timed out; please try again")), 120000);
      })
      .catch(error => finish(error instanceof Error ? error : new Error(String(error))));
  });
}

async function preparePersistence(firebaseAuth: ReturnType<typeof auth>) {
  // Some in-app browsers reject localStorage. Try durable storage first, then
  // session storage, and finally Firebase memory storage so sign-in itself can
  // still complete instead of leaving a blank/unfinished page.
  for (const persistence of [browserLocalPersistence, browserSessionPersistence, inMemoryPersistence]) {
    try {
      await setPersistence(firebaseAuth, persistence);
      return;
    } catch (error) {
      console.warn("[seekhao] auth persistence unavailable; trying next option", error);
    }
  }
  throw new Error("this browser does not allow Firebase authentication storage");
}

export async function signInWithGoogle() {
  const firebaseAuth = auth();
  await preparePersistence(firebaseAuth);

  if (isPopupLikelyBlocked()) {
    // Do not fall through to Firebase redirect on mobile. This project is hosted
    // outside Firebase Hosting and its firebaseapp.com auth helper is unavailable.
    const idToken = await signInWithGoogleIdentityButton();
    const result = await signInWithCredential(firebaseAuth, GoogleAuthProvider.credential(idToken));
    await firebaseAuth.authStateReady();
    if (!result.user || !firebaseAuth.currentUser) throw new Error("firebase did not persist the google session");
    return;
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const result = await signInWithPopup(firebaseAuth, provider);
  await firebaseAuth.authStateReady();
  if (!result.user || !firebaseAuth.currentUser) throw new Error("firebase did not persist the google session");
}

/**
 * Consume any legacy redirect result left by an older deployment. New sign-ins
 * never start a redirect, so this is intentionally checked on every mount and
 * is not guarded by an in-memory flag that would be lost during navigation.
 */
export async function finishRedirectSignIn(): Promise<User | null> {
  if (!firebaseIsConfigured) return null;
  try {
    const result = await getRedirectResult(auth());
    return result?.user ?? null;
  } catch (error) {
    console.error("[seekhao] legacy redirect sign-in failed", error);
    return null;
  }
}

export async function signOutOf() { await auth().signOut(); }
