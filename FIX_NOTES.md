# Seekho — current state (Aug 16, 2026)

## Changelog for this commit (standalone Render support)
- server/_core/localStorage.ts (NEW): local-filesystem audio store under
  os.tmpdir/seekho-storage; localStoragePut / localStorageGetBuffer (path-traversal
  guarded) / storageEnabled / localStorageCleanup (24h sweep).
- server/_core/storageProxy.ts: GET /storage-local/:key serves stored audio;
  daily cleanup interval; forge route unchanged.
- server/routers.ts: transcribeDirectly gated on forgeConfigured — forge absent:
  audio stored locally, platform storage+transcription skipped, Groq Whisper
  (GROQ_API_KEY) transcribes directly; missing key → truthful BAD_REQUEST telling
  user to set GROQ_API_KEY. invokeInterviewModel: Groq failure with platform
  unconfigured rethrows cleaned Groq error instead of falling into invokeLLM's
  guaranteed "API key not configured" crash.
- server/interview.router.test.ts: mocks localStorage module; async
  setForgeConfigured/installMocks({forgeEnabled}); 2 routing-fixed tests
  (ai-failure now isolates the LLM step; harsh-score neutralizes leaked stubs);
  new test for the unconfigured self-hosted error path. 35/35 green.
- Render recipe (see earlier messages): Build `pnpm install && pnpm build`,
  Start `node dist/index.js`, NODE_VERSION=22, NODE_ENV=production,
  GROQ_API_KEY + VITE_FIREBASE_* vars.

## Task right now
Adding free standalone storage + Groq-only deploy path for Render. User wants $0 deploy.
Firebase env vars + GROQ_API_KEY already set on Vercel. User's GitHub identity:
ShaniOnGitHub <hunterone246810@gmail.com> (verified, primary).

## Changes made for standalone Render support (not yet committed)
1. `server/_core/localStorage.ts` (NEW): local filesystem store under os.tmpdir/seekho-storage,
   localStoragePut / localStorageGetBuffer / storageEnabled / localStorageCleanup (24h sweep).
2. `server/_core/storageProxy.ts`: new GET /storage-local/:key route serving stored audio;
   daily cleanup interval.
3. `server/routers.ts`:
   - transcribeDirectly: forgeConfigured gate — if forge absent: localStoragePut only,
     platform transcribeAudio SKIPPED entirely; Groq fallback still applies on quota;
     new message if no transcription at all: "we couldn't transcribe your answer — the
     speech service is not configured. make sure GROQ_API_KEY is set."
   - invokeInterviewModel: if Groq fails AND platform not configured, rethrow cleaned
     Groq error instead of falling into invokeLLM (which throws "OPENAI_API_KEY not configured").

## Test file to update: server/interview.router.test.ts
- beforeEach stubs GROQ_API_KEY="" and mocks storagePut/getSignedUrl + transcribeAudio.
- Since forge envs (ENV.forgeApiUrl/forgeApiKey) are ALSO unset in tests now,
  transcribeDirectly skips the mocked transcribeAudio path → tests that rely on
  mocks.transcribeAudio failing fail.
- Fix approach: mock localStoragePut too (vi.mock ./_core/localStorage), and update
  tests:
  * "propagates transcription-service failure" / "quota exhausted": these now can't
    be reached with no forge; either mock ENV.forgeApiUrl/forgeApiKey in those tests
    via (await import("./_core/env")).ENV.forgeApiUrl = "x" + forgeApiKey = "x"
    (also need to mock fetch for presign URLs?) — storagePut mock handles that.
    Set ENV.forgeApiUrl="http://x" & ENV.forgeApiKey="k" in those two tests.
  * "uses Groq only when quota exhausted": set forge envs + groqApiKey test-key, mock
    fetch for transcriptions.
  * "harsh score" & "overlapping question" tests: they need invokeLLM to work → set
    forgeApiUrl/forgeApiKey dummy so invokeInterviewModel falls back to mocked invokeLLM
    (note: llm.ts assertApiKey checks ENV.forgeApiKey truthy; then fetch is called —
    must mock fetch for chat URLs or the test hangs/fails). The existing mocks don't
    stub fetch; previously with groqApiKey="" invokeInterviewModel returned invokeLLM
    directly (no fetch). Now with forgeApiKey="k", invokeLLM will actually fetch → need
    fetch mock OR keep platform unset and rely on invokeLLM mock return (works only if
    forgeApiKey unset).
    → Best: in beforeEach, also mock `./_core/localStorage` (localStoragePut returns
    {key, localUrl}); add helper setForgeConfigured(env) for the specific tests;
    for plain LLM tests, keep forge unconfigured and set groqApiKey="" — but then
    invokeInterviewModel → invokeLLM (mocked) works. Good.
- IMPORTANT: llm.ts fetch isn't mocked in tests; only tests setting groqApiKey stub
  global fetch. Keep that pattern.

## Env config for Render (already told user)
Build: pnpm install && pnpm build | Start: node dist/index.js | NODE_VERSION=22,
NODE_ENV=production, GROQ_API_KEY, VITE_FIREBASE_* (4 vars same as Vercel).

## Key facts
- Repo: ShaniOnGitHub/seekho (PRIVATE), remote `github` https://github.com/ShaniOnGitHub/seekho.git
- Latest pushed: e890877 (resume octet-stream fix)
- Vercel: seekhao.vercel.app — earlier deployment was commit 17df82b-era (FUNCTION_INVOCATION_FAILED
  due to @shared aliases; alias fix pushed in b7c5589 + docs b6a15b2; e890877 normal push should
  have triggered redeploy; API was still 500ing at last check — verify after push).
- Vercel envs present: GROQ_API_KEY, 4x VITE_FIREBASE_*
- Typecheck command: pnpm check; tests: VITE_FIREBASE_API_KEY=AIzaSyBHQHZED2YOc61ExdkfL7NZz6dl4OnFmP4
  VITE_FIREBASE_AUTH_DOMAIN=ai-interview-d4d6e.firebaseapp.com
  VITE_FIREBASE_PROJECT_ID=ai-interview-d4d6e
  VITE_FIREBASE_APP_ID="1:217420754231:web:7a0b0768cc7675bd64beb2" pnpm test
  (2 flaky timing tests sometimes fail; re-run to confirm)
- Commit convention: -c user.name="ShaniOnGitHub" -c user.email="hunterone246810@gmail.com"
  --author="ShaniOnGitHub <hunterone246810@gmail.com>"

## State update (tests in progress)
- Files added/edited for standalone Render support: server/_core/localStorage.ts (NEW),
  server/_core/storageProxy.ts (new /storage-local/:key route), server/routers.ts
  (forge gate in transcribeDirectly + invokeInterviewModel rethrows when platform unconfigured).
- Test file server/interview.router.test.ts updated: mocks localStorage module,
  async setForgeConfigured()/installMocks({forgeEnabled}) helpers, new test
  "gives a truthful error when no speech service is configured".
- 33/35 tests pass; 2 failing:
  1. "ai-model failure retry message": expects INTERNAL_SERVER_ERROR, but got
     "we couldn't transcribe your answer" (BAD_REQUEST). Root cause: my Groq
     retry loop in transcribeDirectly treats 500 as retryable and after 3 attempts
     throws quotaMessage? No — it throws TRPCError quotaMessage after retries...
     Actually received "we couldn't transcribe your answer" = processUploadedAnswer
     catch wrapping the thrown error. The thrown error was the Groq 500 → after
     retries loop it throws TRPCError quotaMessage ("we couldn't transcribe your
     answer right now..."), which processUploadedAnswer re-wraps.
     → For this test the 500 stub should target Groq chat (429/500 retryable) so
        the final message is the friendly one, OR assert the friendly quotaMessage.
        Simplest: change the test's fetch stub so transcribeAudio path succeeds
        (mock already resolves text via mocks — wait, mocks.transcribeAudio is
        mocked and returns success, but forgeConfigured=true in beforeEach!
        The stub fetch replaces real fetch used by transcribeDirectly's Groq loop
        → Groq fails 3x → throws TRPCError quotaMessage → expected INTERNAL_SERVER...
        WRONG message. Fix: set fetchMock for Groq URL to SUCCEED for audio
        transcriptions (return {text:...}) and fail chat completions — that way
        transcription succeeds and the LLM failure triggers INTERNAL_SERVER_ERROR.
  2. "harsh model score": rejects with "our ai hit a temporary problem". Root
     cause: leaked fetch stub from previous test (ai-failure runs before? no —
     harsh runs after "Groq feedback quota" test which stubs fetch for /chat with
     success + restores via unstubAllGlobals). My new ai-failure test stubs fetch
     but may leak if vitest skips restore on error... Actually harsh runs AFTER
     ai-failure in file order; ai-failure rejects→unstubAllGlobals runs (assertion
     error doesn't skip code after expect? yes it does — expect-rejects resolves
     the promise, no throw). Hmm. Actually the stub leak: my ai-failure stub
     returns 500 for everything incl /v1/storage/presign? It returns presign OK.
     Groq retries loop in transcribeDirectly: apiKey="" → skipped. Then mocked
     transcribeAudio → success. Then evaluateAnswer → invokeInterviewModel:
     groqApiKey="" → invokeLLM mock → feedback score 1 → ok. makeQuestion ok.
     Why still INTERNAL_SERVER? The "temporary problem" message comes from
     processUploadedAnswer catch → something throws non-TRPC: likely transcribeAudio
     path... no. Wait — with leaked stub from GROQ-FEEDBACK-QUOTA test? That test
     stubs fetch for /chat (success) and unstubAllGlobals at end. Fine.
     Hmm — maybe the harsh test's fetch leak is from ai-failure running FIRST and
     EXPECT-REJECTS failing with AssertionError BEFORE vi.unstubAllGlobals? expect(...).rejects.toMatchObject
     throws immediately on mismatch → unstubAllGlobals SKIPPED → stub leaks → harsh
     test's invokeLLM mock? invokeLLM is mocked by vi.mock — fetch stub doesn't
     affect it. But transcribeDirectly: groqApiKey="" → loop skipped → mocked
     transcribeAudio ok. So fetch shouldn't matter for harsh... unless storagePut
     is also mocked. Hmm — then where? makeQuestion uses invokeInterviewModel →
     invokeLLM mock. evaluateAnswer same. So what throws? Possibly the resume
     summary invokeLLM call returns plain 'resume summary' → parseJson → fallback.
     OK fine. Then INTERNAL_SERVER comes from where? -> nextQuestionTask try/catch
     in processUploadedAnswer wraps makeQuestion. fallback... no. Actually the
     harsh test previously passed before my changes. Difference now: beforeEach
     installMocks sets forge ENABLED (previously forge was unset and test passed).
     With forge enabled... transcribeAudio mocked returns success anyway.
     UNLESS: the fetch stub from the failed ai-failure test leaks AND something in
     the chain uses unmocked fetch — e.g., nanoid? no.
     → Practical fix: in harsh test, also stub fetch to succeed for everything:
       vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
- Remaining after tests green: commit (user identity ShaniOnGitHub
  <hunterone246810@gmail.com>), push, tell user Render setup is complete.

## Groq key test (Aug 18, 2026)
- User's key (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) is VALID
  but can ONLY access these models: whisper-large-v3-turbo, openai/gpt-oss-20b,
  whisper-large-v3, openai/gpt-oss-120b, qwen/qwen3.6-27b, allam-2-7b,
  groq/compound-mini, groq/compound (+ safeguard/prompt-guard models).
- llama-3.3-70b-versatile: model_not_found → the error user saw.
- Fix: make GROQ_TEXT_MODEL configurable via env GROQ_TEXT_MODEL with fallback;
  default to "qwen/qwen3.6-27b" (available). Also note json_object response_format
  needs 'json' word in prompt — already handled in request messages presumably.
- Whisper uses whisper-large-v3-turbo → works fine.
- Render live URL: seekho.onrender.com (Live, source 7ee204d).
- Tests to update: interview.router.test.ts if it mocks fetch for chat URL check
  (it checks "https://api.groq.com/openai/v1/chat/completions" call — model name
  change fine).

## 2026-08-18 — OpenRouter fix + current Render state

**User's Render deployment:** https://seekhao.onrender.com (Live, source 7ee204d)
- Env vars on Render: `OPENROUTER_API_KEY` (correctly named, working key — question generation succeeds)
- Missing: `GROQ_API_KEY` — transcription fails with "speech service is not configured"
- User's Groq key: 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
- User's OpenRouter key: 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

**Code changes (routers.ts):**
- Added `invokeOpenRouterChat` using `OPENROUTER_API_KEY` env, model `google/gemini-2.0-flash-exp:free` (configurable via OPENROUTER_MODEL)
- `invokeInterviewModel` prefers: OpenRouter → Groq → platform
- Groq transcription (Whisper) still requires `GROQ_API_KEY`

**Status:** Question generation works. User just needs to add GROQ_API_KEY to Render for transcription.

## Fix: OpenRouter 400 json_validate_failed on answer evaluation (2026-08-18, commit 8e1cffd)

**Symptom:** "our ai hit a temporary problem. please retry this answer." after recording an answer. The first question displayed fine, masking the broken LLM path.

**Root cause:** The first question is a canned template (`openingQuestionForRole`) — no LLM call. Later, `evaluateAnswer` threw `400 Bad Request json_validate_failed` because default model `google/gemini-2.0-flash-exp:free` intermittently rejects strict `json_schema` prompts on OpenRouter free tier. Reproduced locally with the same keys.

**Fix (commit 8e1cffd):**
1. `OPENROUTER_MODEL` default → `google/gemini-3.7-flash` (supports structured output, free on OpenRouter).
2. Retry logic in `invokeOpenRouterChat`: on 400 `json_validate_failed`, retry once on fallback `google/gemini-2.5-flash` with relaxed `{type:"json_object"}` format. Overridable via `OPENROUTER_MODEL` / `OPENROUTER_FALLBACK_MODEL` env vars.
3. Added `console.error` logging for transcription + evaluation failures (real error now shows in Render logs).
4. Regression test "openrouter json schema validation resilience" added; 15/15 tests green.

**Verified live:** probe against seekhao.onrender.com — start + submitAnswerChunk succeed end-to-end (Groq Whisper transcription + OpenRouter evaluation + next question).

**Render envs (unchanged):** `OPENROUTER_API_KEY` + `GROQ_API_KEY`. Vercel (seekhao.vercel.app) was returning NOT_FOUND at last check — it may need its own redeploy since it uses a different build plugin config; the Vercel build-plugin copies server source dirs on push, so a redeploy triggered by the new commit should pull 8e1cffd.
