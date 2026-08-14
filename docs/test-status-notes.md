# Test status notes (internal, 2026-08-14)

## Environment quirk (CONFIRMED)
GROQ_API_KEY is set in the shell env via /home/ubuntu/.user_env (/opt/.manus/webdev.sh.env). `env -u GROQ_API_KEY` does clear it for spawned children. With the key inherited, platform-service mock paths fail because invokeInterviewModel prefers Groq. Unit tests MUST be run with `env -u GROQ_API_KEY` (or the stubEnv lifecycle handles it now — but stubEnv("") in vitest did NOT override process.env reads when the key is inherited at runtime; safest: run pnpm test with env -u).

## Current state: ALL GREEN
- Full unit suite: 27 tests passing (env -u GROQ_API_KEY pnpm test).
- Live five-answer pipeline (pnpm tsx scripts/voice-e2e.mjs, uses inherited real key): passes, final score 2, reportSummary "lacking detail".
- Friendly AI-error translation implemented: processUploadedAnswer wraps evaluateAnswer/makeQuestion/makeReport with try/catch → INTERNAL_SERVER_ERROR "our ai hit a temporary problem. please retry this answer." Test covers it.

## Observations from live pipeline
- Opening question & final transcript fine. finalScore=2 and summary "lacking detail" for a substantive RAG answer: the Groq model (llama-3.3-70b-versatile, see SEEHO_TEXT_MODEL constant) is scoring harsher/differently than Gemini. The 2-5 rubric is in the prompt but Groq returned 2 anyway; normaliseScore clamps. This matches the user's earlier complaint that scoring is hard — but they asked for a 2 floor, which we implemented. Worth reviewing the Groq model choice or adding temperature=0.

## Remaining migration TODO (not started)
1. Vercel serverless adapter: create api/trpc.ts using @trpc/server/adapters/fetch adapter (or node-http fetchAdapter). vercel.json: { "rewrites": [{"source": "/api/trpc/(.*)", "destination": "/api/trpc"}], build output dir handling } — Vercel auto-detects "api" dir. Better: single function `api/trpc.ts` serving all /api/trpc/* routes (fallback rewrite).
2. Update package.json build: keep vite build for client (dist/), esbuild server for api? For Vercel, simplest: api/trpc.ts builds server router with fetch adapter; esbuild for /api.
3. Firebase authorized domains: user must add the final .vercel.app domain in Firebase console (ai-interview-d4d6e project) — remind at delivery.
4. Docs: DEPLOYMENT.md with env vars (GROQ_API_KEY only — no storage keys).
5. Push to GitHub, deliver instructions.

## Key file facts
- server/routers.ts: invokeInterviewModel (line 48) wraps Groq→platform fallback; transcribeDirectly (line ~60) direct Groq Whisper; processUploadedAnswer (159-191) with friendly error wrapping.
- client unchanged for Groq migration (all changes server-side).
- scripts/voice-e2e.mjs: live pipeline uses caller.interview.submitAnswerChunk directly (server import).
- todo.md tracks: Vercel migration items; voice picker DECLINED by user.
- Live public preview: https://3000-ir8cjk79otwky5ph8fljl-c3cfa9a7.us3.manus.computer (manus hosting paused due to billing issue; user deploying to Vercel instead).
- User's Groq key: in env GROQ_API_KEY (webdev secret), verified working for chat + whisper-large-v3-turbo.

## Build simulation status (2026-08-14 ~15:42)
- `pnpm build` succeeded: dist/public/ contains index.html (368KB incl. firebase+pdfjs), pdf.worker.min-CHFwMXne.mjs, pdf-D4EPeiVb.js, index-CIDBCB9w.js.
- esbuild NOT installed globally; use npx esbuild (packages external so it works without install) — Vercel will run it via buildCommand too; consider changing buildCommand to use npx esbuild or add esbuild to package.json dependencies. DECISION: replace buildCommand in vercel.json with `pnpm build && pnpm exec esbuild ...` so it doesn't depend on a global binary.
- api/trpc.ts created (fetch adapter, exports handler), vercel.json created (rewrites /api/trpc(.*) → /api/trpc, functions.maxDuration 60, env NODE_ENV=production, buildCommand + outputDirectory dist/public).
- docs/VERCEL_DEPLOYMENT.md created.
- Remaining: re-run build simulation with npx esbuild, typecheck the api file (it imports server/routers + server/_core/context — context.ts may depend on db/cookies; verify it doesn't pull express-only things), push to GitHub, deliver.
- Unit tests: 27 passing with `env -u GROQ_API_KEY pnpm test`. Live pipeline passes with real key.
