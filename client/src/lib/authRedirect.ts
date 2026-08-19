const AFTER_LOGIN_KEY = "seekhao-after-login";

export function rememberAfterLogin(path: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(AFTER_LOGIN_KEY, path);
  } catch {
    // Some embedded browsers disable sessionStorage. Firebase auth can still
    // complete, so routing remains best-effort in that environment.
  }
}

export function clearAfterLogin() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(AFTER_LOGIN_KEY);
  } catch {
    // Ignore storage errors; they must not turn a successful sign-in into an
    // authentication failure.
  }
}

export function consumeAfterLogin(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const path = window.sessionStorage.getItem(AFTER_LOGIN_KEY);
    if (path) window.sessionStorage.removeItem(AFTER_LOGIN_KEY);
    return path;
  } catch {
    return null;
  }
}
