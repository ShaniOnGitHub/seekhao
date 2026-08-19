# GIS post-login loop diagnosis (Aug 19)

User report: Google account chooser shows, they pick an account, then they're back on the landing page with "try for free" / "sign in" — as if sign-in did not stick.

## Flow analysis
1. Home.begin(): sessionStorage set, signInWithGoogle() awaited inside try/catch.
2. GIS branch: signInWithGoogleIdentity() → prompt callback → signInWithCredential(auth(), credential).
3. If step 2 succeeds: onAuthStateChanged fires with user → Home effect navigates /interview. Good path.
4. If step 2 throws: error propagates to Home catch → toast 'we couldn't open google sign-in' and user stays on landing.

## Most likely cause of the loop
The credential from GIS is rejected by Firebase (signInWithCredential throws), e.g.:
- The Google OAuth client id in GIS must be exactly the same project client linked to the Firebase project. If the client is NOT registered in the Firebase project's "Sign-in method → Google" providers, Firebase rejects the credential.
- OR: GIS prompt dismissed/skipped returns null → GIS returns null → fallthrough to popup/redirect on mobile → popup fails (no window.open) → signInWithRedirect navigates away; but the account chooser DID appear, so GIS returned a credential... UNLESS the user picking an account actually triggered the prompt callback with a CREDENTIAL that failed validation.
- OR: the user didn't actually select an account — the chooser dismissed (prompt callback fired with credential empty? No — if dismissed, callback never fires; isDismissedMoment fires → resolve(null) → fallthrough → popup fails → redirect → but user saw chooser and clicked an account).

## Fix plan
1. Add explicit error logging + toast for GIS branch failures so we (and the user) can see the real error.
2. Guard: if isPopupLikelyBlocked and GIS returns null, show a clear message instead of silent fallthrough (popup/redirect would definitely fail in webview anyway).
3. Robustness: re-throw nothing — but log error + toast with distinct message 'sign-in didn't finish — try again' and clear sessionStorage flag.
4. Interview page: when not authenticated and loading is done, add a retry note; also after GIS credential signInWithCredential, verify user via a re-read of auth().currentUser and only then resolve.

## Test
Cannot fully simulate real mobile; but can verify no-regression with tests and by instrumenting.


## Applied fixes (Aug 19, ~12:00 UTC) — NOT yet tested/pushed
1. client/src/lib/firebase.ts: GIS branch now try/catch around signInWithCredential; throws with logged error instead of silently falling through to popup/redirect (which fail in webviews anyway); verifies auth().currentUser after sign-in.
2. client/src/pages/Home.tsx: failure toast now says "google sign-in didn't finish. pick your account again and retry."
3. client/src/pages/Interview.tsx: clears seekhao-after-login flag when rendering the sign-in wall.
4. client/src/_core/hooks/useFirebaseAuth.ts: FIXED loading race — loading stays true until the FIRST onAuthStateChanged callback (null or user). Before: loading became false immediately, so mid-sign-in navigation to /interview rendered the "sign in to continue" card even though the session was accepted (the apparent login loop).

## Remaining steps
- pnpm check + build + pnpm vitest run
- git commit + push (as ShaniOnGitHub, user wants contribution today)
- Render auto-deploys; confirm new bundle live (curl https://seekhao.onrender.com, grep asset hash)
- Tell user to test: GIS chooser appears → pick account → should now land in /interview onboarding instead of bouncing back
- Note: still cannot simulate real mobile GIS (Google skips prompt in automation), so real-device test is required.


## Status (Aug 19, ~12:00 UTC) — PUSHED & DEPLOYED
- Commit 1b37a71 pushed and Render redeployed (new bundle index-CS5Smq1h.js, hash changed).
- New bundle confirmed to contain "pick your account again" toast text.
- Live sandbox test: clicked sign-in in simulated webview (window.open undefined) — stayed on landing (GIS prompt skipped in headless sandbox; that's expected — Google skips prompts for bots). No toast (skipped path resolves null and falls through; popup likely threw and got caught). No regression visible.
- 40/40 tests pass with Firebase envs. Typecheck clean.
- User asked to "fix it" — the fix IS pushed and live. Next: tell user to test on phone.
