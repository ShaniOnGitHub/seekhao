# seekho — Project Handoff

*Last updated: Aug 14, 2026. This file is the single source of truth for handing the project to a new session. Read this file first; it supersedes memory of prior work.*

## 1. What seekho is

**seekho** (always lowercase) is a voice-first AI technical interview practice web app. A signed-in candidate goes through a five-question spoken interview loop: the app asks a role-tailored question, the candidate records a spoken answer, the answer is transcribed and evaluated by an LLM, spoken coaching feedback is played back, and the next question appears. After five questions, a final performance report is shown.

**Confirmed requirements (from the owner, verbatim where relevant):**
- Landing page first (user "absolutely loves" it — do not redesign) with a **Try for free** CTA above the fold, no scrolling needed.
- Google sign-in via Firebase only after clicking Try for free.
- Onboarding collects **name + target role**, and an **optional resume drop**. After filing, the user goes straight into the Q&A loop.
- Questions are role-tailored; for AI engineering: RAG, LLM, prompt design, LangChain/orchestration, multimodal, MCP.
- Resume is used to tailor questions to experience.
- Transcripts displayed as **subtitle-style typography** while speaking.
- Difficulty ramps: easy → intermediate → advanced → challenging.
- **Woman's voice** preferred for speech synthesis.
- Fast startup: first question appears immediately (static, role-based), no LLM wait.
- **No database for now** — sessions live in memory.
- AGENTS.md coding guidelines in the repo (caution over speed, minimal code, surgical changes).
- Scoring is **encouraging**: 2–5 range; never 1. Even a bad answer gets 2; slightly correct gets 3–4.

## 2. Stack and project layout

- **Framework:** React 19 + Tailwind 4 + Express + tRPC 11, web-db-user Manus scaffold (db/server/user features enabled, though db is intentionally unused).
- **Language:** TypeScript (client + server), ESM. pnpm.
- **Paths:** project at `/home/ubuntu/seekho`. Dev preview: `https://3000-ir8cjk79otwky5ph8fljl-c3cfa9a7.us3.manus.computer`. GitHub: private repo `ShaniOnGitHub/seekho`, commits attributed to `hunterone246810@gmail.com`. Push pattern: `git fetch github main && git rebase github/main && git push github HEAD:main` (rebase to avoid divergence with checkpoint sync commits).
- **Key files:**
  - `server/routers.ts` — tRPC router: `interview.start`, `interview.submitAnswerChunk`, plus pure functions `processUploadedAnswer`, `submitRecordedAnswer`, `invokeInterviewModel`, `transcribeWithGroqFallback`, `makeQuestion`, `evaluateAnswer`, `makeReport`.
  - `server/interview.ts` — session types, `roleFocus()`, `difficultyForQuestion()`, `openingQuestionForRole()`, `normaliseScore()` (floor 2, cap 5), `parseJson()`.
  - `client/src/pages/Interview.tsx` — onboarding + interview room + report. Audio recorded via MediaRecorder, base64-encoded, sent as ordered chunks via `submitAnswerChunk`.
  - `client/src/pages/Home.tsx` — landing page (approved design, don't touch).
  - `client/src/lib/resumeText.ts` — browser-side PDF/TXT extraction (pdfjs-dist; 4 pages max, 14k chars) — extracted text sent as one JSON request, no file upload.
  - `client/src/lib/interviewBrowser.ts` — MIME normalization, microphone error messages, woman-voice preference, request error messages.
  - `client/src/lib/firebase.ts` — Firebase browser SDK.
  - `server/_core/llm.ts` — `invokeLLM` (built-in LLM service) with fetchWithBackoff.
  - `server/_core/voiceTranscription.ts` — `transcribeAudio` (built-in Whisper, no retry).
  - `server/storage.ts` — S3 helpers (`storagePut`, `storageGetSignedUrl`).
  - `scripts/voice-e2e.mjs` — 5-turn live pipeline test (runs locally with caller + mocked fixture audio at `/tmp/seekho-answer.mp3`).
  - `scripts/raw-audio-http-check.mjs` — public preview probe (env: `SEEKHO_BASE_URL`, `SEEKHO_AUDIO_REPEATS`).
  - `docs/transcription-fallback-notes.md` — Groq fallback contract reference.
  - `docs/device-validation-status.md` — device-dependent validation boundary.
- **Commands:** `pnpm check` (tsc), `pnpm test` (vitest — 26 tests, 6 files), `pnpm tsx scripts/voice-e2e.mjs`, `pnpm tsx scripts/raw-audio-http-check.mjs`.

## 3. Design system ("Dusk Ritual")

- Poppins 400, lowercase, slightly negative tracking. Load via Google Fonts in `client/index.html`.
- Gradient tokens: `#f7f7f7 → #b9a0a0 → #794747 → #4e2020 → #111111`. Glass panels, gradient cards, wordmark styled "seekho".
- Theme CSS lives in `client/src/index.css`; landing page components in `Home.tsx`.

## 4. Architecture of the voice flow (validated)

1. **Interview start:** `interview.start` creates an in-memory `InterviewSession` (Map in `server/routers.ts`) with a static, approachable opening question per role — no LLM call, instant. Role focus strings defined in `interview.ts`. Resume text (max 2,500 chars kept in session) seeds context.
2. **Recording:** browser MediaRecorder with `audio/webm;codecs=opus` at 24 kbps (`VOICE_RECORDING_BITS_PER_SECOND`), 4096-byte MIME fallback.
3. **Upload:** whole recording → base64 → **sequential ordered chunks** via `interview.submitAnswerChunk` tRPC mutation (`sessionId`, `uploadId`, `chunkIndex`, `chunkCount`, `mimeType`, `audioBase64` ≤ 60,000 base64 chars per chunk). Chunks accumulate in `pendingAnswerUploads` (5-min TTL); the final chunk concatenates and calls `processUploadedAnswer`.
4. **Processing:** audio → S3 `storagePut` → signed URL → built-in Whisper → LLM feedback → push answer → next question.
5. **Concurrency (validated):** `makeQuestion` for the NEXT question runs **concurrently** with feedback evaluation, using a snapshot that INCLUDES the just-transcribed answer (`priorAnswers` parameter) so question number/difficulty/context stay correct. Final (5th) answer skips this and runs the report.
6. **Scoring:** model instructed to use whole numbers 2–5 with rubric: 2 = almost no substance/off-topic; 3 = basic/slightly correct; 4 = reasonably correct with multiple relevant details; 5 = excellent. `normaliseScore` enforces floor 2 / cap 5 (fallback score 3 on malformed AI output).
7. **Latency wins (measured):** same 241 KB recording went from 12.1 s → 6.2 s (~49% reduction) via (a) skipping 412 quota-retry backoff (returns immediately to trigger fallback), (b) smaller `max_tokens` (400 questions, 500 feedback, 800 report), (c) 24 kbps capture, (d) concurrent next-question generation.

## 5. Firebase auth

- Firebase project `ai-interview-d4d6e` with Google provider configured (owner did this in console).
- Authorized domains must include the preview domain `3000-ir8cjk79otwky5ph8fljl-c3cfa9a7.us3.manus.computer` (fixed previously: typo was blocking the popup).
- Browser-only flow; server does not verify Firebase. `useFirebaseAuth()` from Interview page; `signInWithGoogle()`.

## 6. AI services and fallbacks (validated behavior)

- **Primary model:** `gemini-3-flash-preview` via built-in `invokeLLM`. Uses `max_tokens` (NOT `max_completion_tokens`).
- **Primary transcription:** built-in Whisper (`whisper-1` via `transcribeAudio`, `/v1/audio/transcriptions`, verbose JSON).
- **Quota exhaustion:** both built-in services sometimes return **412 "usage exhausted"**. Fallbacks are narrow and quota-triggered only:
  - Transcription fallback: Groq `whisper-large-v3-turbo` at `https://api.groq.com/openai/v1/audio/transcriptions` (multipart, `language=en`, `response_format=json`). Key from `GROQ_API_KEY` (user-provided).
  - Interview-model fallback: Groq `llama-3.3-70b-versatile` at `https://api.groq.com/openai/v1/chat/completions` (JSON body, `max_tokens`, `response_format: {type:"json_object"}`). Key from `GROQ_API_KEY`.
- **LLM retry policy:** `fetchWithBackoff` in `server/_core/llm.ts` — 412 returns immediately (no retry) so the quota fallback engages fast.
- Voice playback is `window.speechSynthesis` — prefers woman-coded English voices (Aria, Ava, Hazel, Jenny, Libby…), rate 0.94, with an `unavailable` state and replay controls in the UI.

## 7. Infrastructure constraints learned (do not re-discover)

- **Azure Application Gateway in front of the preview blocks `Content-Type: audio/*` with 403 Forbidden** (root cause of the original "unreadable response" for answers > ~5 s). Raw binary audio HTTP is permanently unusable; always send audio as base64 through tRPC JSON.
- **Single large JSON bodies can also be rejected** (~400 KB+ base64 PDF was blocked; audio up to ~241 KB base64 with repeats works; chunk size 56,000–60,000 base64 chars per request is safe).
- Never reintroduce `server/interviewAudio.ts` (binary endpoint — removed) or its registration in `server/_core/index.ts`.
- Preview domain differs from any published `*.manus.space` domain; re-authorize Firebase domains on publish.

## 8. Test status

- 26 vitest tests passing (router coverage includes: expired session, transcription failure, quota-exhausted message, Groq transcription fallback trigger, Groq chat fallback trigger, harsh-score floor raise, state-consistent concurrent next question, ordered chunk reassembly, malformed report fallback).
- `scripts/voice-e2e.mjs` 5-turn pipeline passing.
- Public probe `raw-audio-http-check.mjs` passing with measured latency.
- Score assertion in the probe fixture: `feedback.score` must be 2–5.

## 9. Remaining open items (new session must complete)

1. **Real-browser final report run:** owner confirmed the working flow up to next-question progression after the latency fix; nobody has yet run all five questions in a real browser and confirmed the final report after the latest changes.
2. **Audible playback:** browser speech synthesis is device-dependent. Verify opening questions/feedback are audible in the user's browser, and the replay control works. (Sandbox browser cannot do this.)
3. **Desktop/mobile layout pass:** landing verified at mobile width; the full authenticated onboarding → interview → report journey on mobile is unverified.
4. **Publishing:** the user has not published yet; on publish, Firebase authorized domains must include the new `*.manus.space` domain or Google sign-in will break again (the earlier symptom was "couldnt continue google sign in pls try again later").

## 10. Owner communication notes

- Respond with measured, honest, specific language; avoid "perfect"/"fully bug-free" claims.
- The owner tests in a real browser and reports errors verbatim; reproduce before claiming fixes.
- The user-provided Groq API key is set as `GROQ_API_KEY` in the project (via secrets card in prior session — verify it is still configured in Settings → Secrets before relying on fallbacks).
- User also pasted an AGENTS.md spec earlier; it exists at repo root.
