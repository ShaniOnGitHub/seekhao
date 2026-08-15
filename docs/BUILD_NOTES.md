# Build / Deployment Notes (internal)

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
