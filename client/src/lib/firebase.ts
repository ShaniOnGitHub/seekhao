import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, type User } from "firebase/auth";

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
  await signInWithPopup(auth(), provider);
}

export async function signOutOf() { await auth().signOut(); }
