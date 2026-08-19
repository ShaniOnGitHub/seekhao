# Firebase auth research

Sources:
- https://firebase.google.com/docs/auth/web/redirect-best-practices
- https://firebase.google.com/docs/auth/web/google-signin

Key findings:

Firebase states that redirect sign-in relies on a cross-origin iframe and can fail in browsers that block third-party storage. For apps hosted outside Firebase Hosting, Firebase documents alternatives: popup sign-in, proxying `/__/auth/` requests, self-hosting the sign-in helper files, or handling provider sign-in independently.

The documented independent-provider path is to use Google Identity Services to obtain a Google ID token, create `GoogleAuthProvider.credential(idToken)`, and call `signInWithCredential(auth, credential)`. After that, the Firebase session should behave like any other Firebase-authenticated session.

The current application already attempts this GIS path, but the user's latest symptom is a white/stuck screen after account selection. Therefore the next diagnosis must capture the exact callback/result/error and prevent the UI from remaining blank while the credential exchange is pending. The current fallback to Firebase popup/redirect should not be used after GIS account selection if GIS returned a credential, because the fallback re-enters the broken `ai-interview-d4d6e.firebaseapp.com/__/auth/handler` path.

The current source has an additional risk: `signInWithGoogleIdentity()` resolves `null` on `isSkippedMoment`/`isNotDisplayed` and after a timeout, and `signInWithGoogle()` then silently falls through to popup/redirect. The post-selection blank screen may be caused by a GIS callback that never resolves, a rejected `signInWithCredential`, or a render/navigation race. The final fix should add an explicit pending state/timeout and a visible error recovery UI, and should use only a validated GIS callback result for mobile/webviews.

The current Firebase config uses `ai-interview-d4d6e.firebaseapp.com` as `authDomain`; direct requests to its helper path have previously shown that the project does not expose a usable Firebase Hosting handler, so redirect must not be treated as the primary mobile solution.

Date: Aug 19, 2026.
