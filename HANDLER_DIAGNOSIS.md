# Critical diagnosis — mobile sign-in root cause (Aug 18, 2026)

curl https://ai-interview-d4d6e.firebaseapp.com/__auth/handler returns **HTTP 404 "Site Not Found"**.

The `ai-interview-d4d6e.firebaseapp.com` domain is the Auth domain of the Firebase project, but **no Firebase Hosting site exists at that domain** (the 404 page is Firebase Hosting's default "Site Not Found"). The `/__/auth/handler` endpoint only works when Firebase Hosting is enabled for that project — Hosting serves the handler page.

Why sign-in ever worked on desktop: on desktop the app uses **signInWithPopup**, which communicates with google.com via a popup and iframe postMessage — it does NOT navigate to firebaseapp.com. On mobile/in-app browsers, popups fail, so we switched to **signInWithRedirect**, which DOES navigate to https://ai-interview-d4d6e.firebaseapp.com/__auth/handler — and that returns 404 in the user's browser ("A problem repeatedly occurred").

The redirect URI baked into the OAuth request (from screenshots):
https://ai-interview-d4d6e.firebaseapp.com/__auth/handler

## Fix options
1. **Enable Firebase Hosting** for project ai-interview-d4d6e (firebase-tools CLI, `firebase hosting:channel:deploy` or `firebase deploy --only hosting`). Costs nothing, free tier. Then /__/auth/handler serves properly and signInWithRedirect works.
2. Alternative (no Hosting): keep popup mode on mobile but make it more robust, OR serve our own handler page — complex; Hosting is the canonical fix.
3. Also consider: in WhatsApp in-app browser, cross-domain redirects can still fail even with Hosting (WebView cookie blocking). If option 1 alone fails, next step: serve the handler page ourselves on the app domain (seekhao.onrender.com) — Firebase supports custom auth handlers via `authDomain` on the same origin. Actually authDomain must be firebaseapp.com... but Hosting with a custom domain can serve it; simplest robust fallback: detect in-app webview and show an "open in browser" guidance, or use `signInWithRedirect` with the app domain — see below.

## Verified facts
- Desktop popup mode: works (tested).
- Mobile/WebView with popup: fails (user report).
- Mobile/WebView with redirect: fails with 404 Site Not Found at firebaseapp.com/__auth/handler (my curl test).
- Hosting project needed: `firebase hosting:sites:create ai-interview-d4d6e` or default site exists; need `firebase-tools` login via user's account.

## TODO
- Try option 1 via firebase CLI if login token available; else give user exact commands / instructions.
- Test with Hosting enabled: mobile redirect flow end-to-end.
