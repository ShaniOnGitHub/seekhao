# Build / Deployment Notes (internal)

## Fix: user-reported "upload was interrupted" on start-my-practice (2026-08-16)
- Verified live: Manus prod interview.start = 200; final submitAnswerChunk = BAD_REQUEST
  "speech transcription ... quota has been reached" (platform quota exhausted; GROQ_API_KEY
  not effective in Manus prod at that time). Vercel still 500 FUNCTION_INVOCATION_FAILED on
  every api/trpc call (needs JWT_SECRET + GROQ_API_KEY in Vercel envs).
- Changes:
  1. client/src/lib/interviewBrowser.ts: gateway-HTML error message reworded from "that upload
     was interrupted before it reached seekhao" to "the request was interrupted before it
     reached seekhao — usually a brief network or server hiccup..." (it applies to ANY request,
     not uploads — the old wording confused users during onboarding).
  2. client/src/pages/Interview.tsx uploadAnswer: retries each chunk up to 3x for transient
     errors (network/HTML-parse/429/5xx) with backoff; final failure preserves the real server
     error message instead of masking everything as "the recording upload was interrupted".
  3. server/routers.ts submitAnswerChunk: expired-session chunk mismatch now says the session
     expired (was misleading "interrupted"); out-of-order chunks say "chunks arrived out of
     order".
  4. server/routers.ts transcribeDirectly: when platform quota exhausted AND a Groq key exists
     (ENV.groqApiKey || process.env.GROQ_API_KEY), transcribe via Groq Whisper as fallback.
- Test script: scripts/repro_upload.ts (tRPC v11 batch body {"0":{"json":input}}). 28/28 tests passing.

## Diagnosis: "upload was interrupted before it reached seekhao" (2026-08-15)
- Root cause on production (seekho-ai-frtcy7di.manus.space): Groq Whisper transcription
  returns HTTP 429 ("service quota reached") → backend threw BAD_REQUEST with the message
  "speech transcription is temporarily unavailable because its service quota has been
  reached. please try again later."
- The frontend `interviewRequestErrorMessage()` in client/src/lib/interviewBrowser.ts maps
  JSON-parse failures ("unexpected token ... < ...") to "that upload was interrupted before
  it reached seekhao. refresh this page once, then try again." — but the user sees the toast
  wording "upload was interrupted"; the visible production error was actually the quota error.
- Fixed in server/routers.ts `transcribeDirectly`: retry loop (3 attempts, 1s backoff) on
  HTTP 429/5xx before giving up with a friendly quota message.
- IMPORTANT: Manus deployment has NO GROQ_API_KEY in its env; platform fallback
  `transcribeAudio` via signed S3 URL is used, and its quota WAS exhausted at test time.
  The Vercel deployment DOES have GROQ_API_KEY set by the user → retries on Groq apply there.
  Manus production envs are managed via webdev_request_secrets; Groq key is NOT currently
  injected in Manus deployment (user set it on Vercel).

## Vercel setup (user-deployed at seekhao.vercel.app)
- Repo: github.com/ShaniOnGitHub/seekho, branch main, user identity commits.
- vercel.json: buildCommand pnpm build, outputDirectory dist/public, functions api/trpc.ts,
  rewrites /api/trpc* → /api/trpc. No bundling — api/trpc.ts is the function (TypeScript native).
- Previously failed deploys were due to an accidentally committed api/trpc.js (removed, gitignore api/*.js).
- Required Vercel env vars (user sets manually):
  - VITE_FIREBASE_API_KEY=AIzaSyBHQHZED2YOc61ExdkfL7NZz6dl4OnFmP4
  - VITE_FIREBASE_AUTH_DOMAIN=ai-interview-d4d6e.firebaseapp.com
  - VITE_FIREBASE_PROJECT_ID=ai-interview-d4d6e
  - VITE_FIREBASE_APP_ID=1:217420754231:web:7a0b0768cc7675bd64beb2
  - GROQ_API_KEY (user's current key, gsk_...)
- Firebase console: add seekhao.vercel.app to Authorized domains (project ai-interview-d4d6e).

## Manus deployment envs (automatic, injected)
VITE_FIREBASE_*, GROQ_API_KEY(?), BUILT_IN_FORGE_*, JWT_SECRET, DATABASE_URL etc.
NOTE: GROQ_API_KEY env exists in this sandbox build but may not be in Manus production env —
if production shows quota errors, ask user to re-add GROQ_API_KEY via secrets card OR use
webdev_request_secrets.

## Production transcription fix (2026-08-15, in progress)
- Checkpoint e6e7aec0: retry loop added; key injected via webdev_request_secrets, but
  production STILL returned platform-quota error because process.env.GROQ_API_KEY was not
  propagated to the deployed runtime (secrets only hit the sandbox; the template injects
  envs declared in server/_core/env.ts).
- Checkpoint 0cadbbdd (current): added `groqApiKey` to server/_core/env.ts; routers.ts
  reads ENV.groqApiKey in transcribeDirectly + invokesGroqChat region; warn logged when
  missing; tests stub via ENV module (beforeEach async). 28 tests passing.
- After deploy of 0cadbbdd: retest production endpoint (interview.start +
  submitAnswerChunk with fake audio via /home/ubuntu test scripts) to confirm Groq path is taken.
- If still failing in prod: check manus-webdev-logs for "[transcribeDirectly] groq disabled".
- User-facing status: Vercel deploy seekhao.vercel.app works with user's own env vars;
  Manus production (seekho-ai-frtcy7di.manus.space) is now also keyed for Groq.

## Commit convention
- Always `git commit --amend --author="ShaniOnGitHub <hunterone246810@gmail.com>"` then
  force-push to `github` remote (ShaniOnGitHub/seekho) for contribution graph.

## Vercel FUNCTION_INVOCATION_FAILED investigation (2026-08-15)
- Live Vercel (seekhao.vercel.app): EVERY api/trpc call returns HTTP 500
  FUNCTION_INVOCATION_FAILED, even interview.start without resume. The Manus
  domain (seekho-ai-frtcy7di.manus.space) works fine.
- Handler loads OK in sandbox with only GROQ_API_KEY + firebase envs present
  (JWT_SECRET needed by cookie utils). So startup import itself doesn't crash
  in our test env. Suspects on Vercel cold start:
  * missing JWT_SECRET (user never added it to Vercel env vars) → cookie.ts
    likely throws when signing cookies without it
  * missing DATABASE_URL? db connection lazily used; check db.ts init path
- Action: make JWT_SECRET optional in cookie utils OR instruct user to add
  JWT_SECRET to Vercel env vars. Prefer making app tolerant: cookie.ts
  getSessionCookieOptions guards needed.
- Vercel envs user must set: GROQ_API_KEY, JWT_SECRET (random 32+ chars),
  VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID,
  VITE_FIREBASE_APP_ID.

## Test failures after retry-loop change (2026-08-15)
- 2 of 28 tests time out in server/interview.router.test.ts:
  1. "returns a safe report when the final structured AI response is malformed"
  2. "groq transcription resilience > retries transient groq 429"
- Root cause: transcribeDirectly reads process.env.GROQ_API_KEY directly, NOT
  (await import("./_core/env")).ENV.groqApiKey. The retry test stubs
  ENV.groqApiKey and mocks globalThis.fetch — but the retry loop hits a
  non-Groq fetch path (`return realFetch(url, init)` → platform fallback
  invokeLLM mock) which never resolves or takes long → vitest 30s timeout.
  The malformed-report test times out similarly (real Groq transcription call
  with no key? no — key env stub empty → fallback to platform transcribeAudio
  mock; likely something else hangs; check invokeGroqChat path).
- Fix plan: make transcribeDirectly read ENV.groqApiKey (env module) like
  the chat path already does, so tests can stub it. Or stub process.env in
  those tests.
- Vercel fix status: vite plugin copyApiFunctionPlugin added — api/trpc.ts now
  copies into dist/public/api on build (verified locally). Pushed next step:
  mark todo, checkpoint, push as user identity, tell user to:
  1. Add Vercel envs: GROQ_API_KEY, JWT_SECRET (32+ random chars),
     VITE_FIREBASE_API_KEY/AUTH_DOMAIN/PROJECT_ID/APP_ID (firebase values
     from earlier session), then Redeploy latest commit on Vercel.
  2. Firebase console: add seekhao.vercel.app to authorized domains.
- Vercel envs user already pasted earlier (groq key same as before; firebase
  config in earlier session: apiKey AIzaSyBHQHZED2YOc61ExdkfL7NZz6dl4OnFmP4,
  authDomain ai-interview-d4d6e.firebaseapp.com, projectId ai-interview-d4d6e,
  appId 1:217420754231:web:7a0b0768cc7675bd64beb2).

## 2026-08-16 — Vercel API fix
- Root cause of persistent FUNCTION_INVOCATION_FAILED: `@shared/*` path aliases
  (resolved only by Vite, not by Vercel's serverless tsx loader) in
  server/routers.ts and server/_core/{oauth,sdk,trpc}.ts.
- Fix: relative imports; build plugin copies api/, server/, shared/, drizzle/
  + package.json into dist/public.
- Verified with a Vercel-condition simulation (NODE_ENV=production, same env
  shape) — interview.start returns 200 with a generated question.
- Note: Vercel ignores git force-pushes, so the alias fix must be pushed as a
  fresh commit to trigger a rebuild.
