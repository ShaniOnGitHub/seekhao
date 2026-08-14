# Deploying seekho to Vercel

This document walks through deploying seekho on Vercel with Groq as the only external service. No storage account is required: audio is transcribed directly in memory by Groq Whisper and never persisted.

## 1. Prerequisites

- A free [Vercel account](https://vercel.com) (no card needed for hobby projects)
- The `GROQ_API_KEY` you already have (from [console.groq.com](https://console.groq.com/keys))
- Your Firebase project `ai-interview-d4d6e` (already configured for Google sign-in)

## 2. Import the project

1. Go to [vercel.com/new](https://vercel.com/new) and sign in with GitHub.
2. Import the repository `ShaniOnGitHub/seekho`.
3. Framework Preset: **Vite**. Vercel auto-detects `vercel.json`, so you can leave all build settings at their defaults — no need to fill in Build/Output/Install commands.

## 3. Add the environment variable

In the import screen (or afterwards under **Settings → Environment Variables**), add:

| Key | Value | Scope |
|---|---|---|
| `GROQ_API_KEY` | your Groq API key | Production, Preview, Development |

No other environment variables are needed. The Firebase config is baked into the client bundle at build time and is already committed to the repo.

## 4. Authorize your new domain in Firebase

After deployment, Vercel assigns a `*.vercel.app` domain (e.g., `seekho-xxx.vercel.app`). Google sign-in will fail until you authorize it:

1. Open the [Firebase Console → your project](https://console.firebase.google.com/project/ai-interview-d4d6e/authentication/settings).
2. Under **Authorized domains**, click **Add domain**.
3. Paste your Vercel domain **without** the `https://` prefix (e.g., `seekho-xxx.vercel.app`) and save.

If you later bind a custom domain, repeat this step for that domain too.

## 5. How it works on Vercel

| Concern | Behavior |
|---|---|
| API | `api/trpc.ts` is a single Vercel Function serving every tRPC procedure (including the chunked audio upload). Vercel rewrites `/api/trpc/*` to it. |
| Static assets | Built to `dist/public` by Vite and served directly by Vercel's edge CDN. |
| AI models | Groq `llama-3.3-70b-versatile` generates questions, feedback, and reports; `whisper-large-v3-turbo` transcribes audio. |
| Sessions | In-memory per function instance. A practice session can be lost if the function recycles mid-interview — short breaks are fine, long pauses may require restarting. |
| Firebase | Browser SDK only; the server never touches Firebase. |

## 6. Local development (unchanged)

`pnpm dev` still runs the Express server with Vite HMR exactly as before. The Vercel function does not affect local workflow. Set `GROQ_API_KEY` in a `.env` file locally (which is already gitignored) to exercise the Groq path during development.

## 7. Known caveats

- **Function memory/size**: tRPC requests carry base64 audio chunks capped at ~128 KB each; the 60-second max duration covers the slowest AI round comfortably.
- **Cold starts**: a function that hasn't been used recently takes a moment to boot; the first question is static and appears immediately regardless.
- **In-memory sessions**: interviews in progress are not stored anywhere; the app tells the candidate when a session has expired.
