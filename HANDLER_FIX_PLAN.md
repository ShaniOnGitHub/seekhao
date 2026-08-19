# Mobile sign-in fix — verified diagnosis + chosen solution (Aug 18, 2026)

## Root cause (VERIFIED)
`curl https://ai-interview-d4d6e.firebaseapp.com/__auth/handler` → **HTTP 404 "Site Not Found"**. Also `ai-interview-d4d6e.web.app/__auth/handler` → 404. The Firebase project `ai-interview-d4d6e` has **no Hosting site enabled**, so the `/__/auth/handler` page Firebase's redirect flow needs does not exist. On mobile the app now uses `signInWithRedirect` which navigates to that URL → 404 → user sees "A problem repeatedly occurred" on the firebaseapp.com page.

## Official Firebase guidance (firebase.google.com/docs/auth/web/redirect-best-practices)
For apps NOT hosted on Firebase Hosting, the doc offers:
- Option 3 (proxy): reverse-proxy `https://<app domain>/__/auth/` → `https://<project>.firebaseapp.com/__/auth/` transparently (NOT 302), then set `authDomain` to app domain, authorize `https://<app domain>/__/auth/handler` as redirect URI.
- Option 4 (self-host helper code): download handler, handler.js, experiments.js, iframe, iframe.js, links, links.js, init.json from firebaseapp.com and serve under app domain; set authDomain = app domain; authorize redirect URI.
- Option 5: use Google Sign-In directly (gapi/GSI), get id_token, then `signInWithCredential(auth, GoogleAuthProvider.credential(idToken))` — completely avoids firebaseapp.com handler.

## Problem with Option 3/4 here
The project's own firebaseapp.com also 404s the helper files (`wget https://ai-interview-d4d6e.firebaseapp.com/__/auth/handler` would 404), so proxying/self-hosting from the project's own domain is impossible. Option 4 requires files from firebaseapp.com which are 404.

## CHOSEN SOLUTION: Option 5 — direct Google Sign-In via GSI (no firebaseapp.com dependency at all)
Use Google Identity Services (GIS) script `https://accounts.google.com/gsi/client` loaded on the client:
1. Call `google.accounts.id.initialize({ client_id: GOOGLE_OAUTH_CLIENT_ID, callback: onCredential })`
2. `google.accounts.id.prompt()` (one-tap) or render a button — in mobile WebView the `prompt()` works, or we can use `google.accounts.oauth2.initTokenClient` for the full OAuth flow.
3. Receive `credential` (JWT) → `signInWithCredential(auth, GoogleAuthProvider.credential(credential))` → Firebase session established, `onAuthStateChanged` fires.
- Client id (from OAuth URLs seen earlier): `217420754231-nj6e0supa2n15fpb2193erm41sr0g6vc.apps.googleusercontent.com`
- This works even in WhatsApp in-app browser; fallback: if GSI blocked, try popup then redirect with error message guidance.
- Need to verify: Google OAuth client has seekhao.onrender.com in authorized origins (popup flow worked earlier on desktop, so likely OK; also firebase authorized domains include it).

## Implementation plan
1. `client/src/lib/googleSignIn.ts`: load GIS script on demand, `initGoogleIdentity(clientId, onCredential)`, `triggerGooglePrompt()` (one-tap, cancels silently), `signInWithGoogleToken(idToken)` using firebase `signInWithCredential`.
2. `client/src/lib/firebase.ts`: `signInWithGoogle()` tries GIS one-tap first (mobile/webview-friendly), falls back to popup, falls back to redirect.
3. Keep existing code paths; no server changes needed.
4. Test live: mobile simulation (window.open undefined + blocked popup) → one-tap prompt appears; complete flow verified via credential exchange.

## Key env/config
- Firebase config: apiKey AIzaSyBHQHZED2YOc61ExdkfL7NZz6dl4OnFmP4, authDomain ai-interview-d4d6e.firebaseapp.com, projectId ai-interview-d4d6e, appId 1:217420754231:web:7a0b0768cc7675bd64beb2
- Google OAuth client: 217420754231-nj6e0supa2n15fpb2193erm41sr0g6vc.apps.googleusercontent.com

## Prior commits
- 3a9408b mobile redirect fix (code verified live in bundle, but handler 404s → insufficient)
- b90bc4f empty trigger commit
- Live bundle verified at /assets/index-B5gN1g_Y.js (Render last-modified 16:53:40 GMT)
