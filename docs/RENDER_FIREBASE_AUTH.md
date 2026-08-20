# Render and Firebase authentication configuration

## Render environment variables

Set these variables for the production service and redeploy:

```text
VITE_FIREBASE_API_KEY=<Firebase Web API key>
VITE_FIREBASE_AUTH_DOMAIN=ai-interview-d4d6e.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=ai-interview-d4d6e
VITE_FIREBASE_APP_ID=1:217420754231:web:7a0b0768cc7675bd64beb2
VITE_GOOGLE_CLIENT_ID=217420754231-nj6e0supa2n15fpb2193erm41sr0g6vc.apps.googleusercontent.com
```

`VITE_GOOGLE_CLIENT_ID` is a public OAuth browser client identifier, not a client secret. Do not place a Google OAuth client secret in frontend environment variables.

The Firebase flow does not require `OAUTH_SERVER_URL`. That variable belongs to the separate Manus server-side OAuth SDK included in the project scaffold. If the application is intended to use Firebase Google authentication only, leave it unset; the server logs should describe Manus OAuth as disabled rather than treating startup as failed. If the Manus OAuth login path is intentionally needed, obtain its URL from the Manus/WebDev runtime configuration instead of using the Firebase `authDomain` value.

## Firebase Console

In Firebase Console for project `ai-interview-d4d6e`:

1. Open **Authentication → Sign-in method** and enable **Google**.
2. Open **Authentication → Settings → Authorized domains** and add `seekhao.onrender.com` without `https://`.
3. In the linked Google Cloud project, open the OAuth web client identified by `217420754231-nj6e0supa2n15fpb2193erm41sr0g6vc.apps.googleusercontent.com` and add `https://seekhao.onrender.com` under **Authorized JavaScript origins**.
4. Keep Firebase’s handler URI available as `https://ai-interview-d4d6e.firebaseapp.com/__/auth/handler`. This is used by Firebase’s provider configuration; it is not a Render environment variable.

## User flow

The landing page now sends unauthenticated users to `/signin`. `/login` is an alias for the same screen. After Google returns a credential, Firebase establishes the session and the app navigates to `/interview`. Popup-capable desktop browsers use Firebase popup sign-in. Mobile or popup-blocked browsers use Google Identity Services and exchange the returned ID token with Firebase on the current page, avoiding the fragile full-page redirect callback.

## Verification checklist

After changing the Render variables and Firebase Console settings, redeploy and test these URLs directly:

```text
https://seekhao.onrender.com/signin
https://seekhao.onrender.com/login
```

The expected sequence is: open `/signin` or `/login`, choose a Google account, return to the sign-in screen briefly while Firebase restores state, then navigate to `/interview`. If sign-in still fails, the sign-in page now displays the Firebase error instead of silently returning to `/`.
