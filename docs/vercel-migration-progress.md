# Vercel Migration Progress Notes (internal)

## Decisions confirmed by user
- Use new Groq key (set as GROQ_API_KEY secret, verified: chat 200 OK, whisper transcription verified with /tmp/seekhao-answer.mp3 → correct RAG transcript)
- NO storage: transcribe base64 audio directly to Groq Whisper (whisper-large-v3-turbo) in one request; recordings never persisted. `transcribeDirectly()` in server/routers.ts does Groq first, falls back to platform storage+transcription if no key or Groq fails.
- No voice picker — keep automatic woman-coded browser voice.
- LLM model: llama-3.3-70b-versatile; Groq response_format must be json_object (json_schema not supported) — handled by `invokeGroqChat()` converting json_schema→json_object.
- Groq is PRIMARY when GROQ_API_KEY set; platform LLM becomes fallback so dev mode keeps working.

## Changes done so far
1. `server/routers.ts`:
   - `invokeGroqChat()` + `invokeInterviewModel()` now use Groq when key present (fallback platform)
   - `transcribeDirectly()` replaces old processUploadedAnswer flow: Groq Whisper direct, fallback to storagePut + transcribeAudio
   - `processUploadedAnswer` simplified: calls transcribeDirectly, empty-transcript guard
2. `server/interview.router.test.ts`: `vi.stubEnv("GROQ_API_KEY", "")` in beforeEach to keep existing platform-mock paths (2 tests were failing because real fetch went to Groq instead of mocks).

## Still TODO
- Re-run pnpm test after stubEnv fix (had 2 failing tests before fix)
- Run `pnpm tsx scripts/voice-e2e.mjs` — may need env GROQ_API_KEY present; check script uses submitRecordedAnswer (server fn) → Groq will be hit for real transcription/LLM
- Vercel adaptation: create `vercel.json` + serverless entry (tRPC HTTP adapter in api/trpc/[...trpc].ts or output: "server"), output config for build. Decide: use @trpc/server/adapters/node-http fetch adapter under Vercel function. Keep dev server (Express) for local.
- Docs/DEPLOY.md with env vars: GROQ_API_KEY, VITE_FIREBASE_* (already injected), Firebase authorized domains must include final vercel domain.
- Update HANDOFF.md with migration info.
- Push to ShaniOnGitHub/seekhao (use merge pattern not rebase; remote had divergence issues before — use `git merge github/main --allow-unrelated-histories -s ours` style or pull --rebase with conflict resolution; last successful push was 1c18179).
- Checkpoint via webdev_save_checkpoint (auto-publish enabled — warn user publish URL seekhao-ai-frtcy7di.manus.space shows billing banner; new code changes deploy automatically).

## Key paths
- client voice: client/src/lib/interviewBrowser.ts preferredEnglishVoice (unchanged)
- dev server: server/_core/index.ts Express (unchanged, kept for local)
- tests: 26 tests, pnpm test; e2e script scripts/voice-e2e.mjs uses submitRecordedAnswer directly
- probe audio: /tmp/seekhao-answer.mp3
