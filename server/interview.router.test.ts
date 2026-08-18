import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invokeLLM: vi.fn(),
  storageGetSignedUrl: vi.fn(),
  storagePut: vi.fn(),
  transcribeAudio: vi.fn(),
}));

vi.mock("./_core/llm", () => ({ invokeLLM: mocks.invokeLLM }));
vi.mock("./_core/voiceTranscription", () => ({ transcribeAudio: mocks.transcribeAudio }));
vi.mock("./storage", () => ({ storageGetSignedUrl: mocks.storageGetSignedUrl, storagePut: mocks.storagePut }));
vi.mock("./_core/localStorage", () => ({
  localStoragePut: vi.fn().mockImplementation((key: string) => Promise.resolve({ key, localUrl: `/storage-local/${key}` })),
  storageEnabled: vi.fn().mockReturnValue(true),
}));
let localStorageMock: Awaited<typeof import("./_core/localStorage")>;
beforeAll(async () => {
  localStorageMock = vi.mocked(await import("./_core/localStorage"));
});

import { appRouter } from "./routers";

async function setForgeConfigured(enabled: boolean) {
  const envModule = (await import("./_core/env")) as unknown as { ENV: Record<string, string> };
  envModule.ENV.forgeApiUrl = enabled ? "http://local-forge" : "";
  envModule.ENV.forgeApiKey = enabled ? "test-forge-key" : "";
}

async function installMocks({ forgeEnabled = true }: { forgeEnabled?: boolean } = {}) {
  await setForgeConfigured(forgeEnabled);
  mocks.storagePut.mockImplementation((key: string) => Promise.resolve({ key, url: `/manus-storage/${key}` }));
  mocks.storageGetSignedUrl.mockResolvedValue("https://storage.example/test-audio");
  mocks.transcribeAudio.mockResolvedValue({ text: "I would evaluate retrieval recall, faithfulness, latency, and cost." });
  installSuccessfulAiMocks();
}

import { appRouter } from "./routers";

function createCaller() {
  return appRouter.createCaller({
    user: null,
    req: { protocol: "https", headers: {} },
    res: { clearCookie: vi.fn() },
  } as never);
}

function completion(content: string) {
  return { choices: [{ message: { content } }] };
}

function installSuccessfulAiMocks({ malformedReport = false }: { malformedReport?: boolean } = {}) {
  mocks.invokeLLM.mockImplementation((request: { response_format?: { json_schema?: { name?: string } } }) => {
    const name = request.response_format?.json_schema?.name;
    if (name === "interview_question") return Promise.resolve(completion('{"question":"how would you evaluate a rag retrieval system?","focus":"retrieval quality","followUpHint":"name your metrics"}'));
    if (name === "answer_feedback") return Promise.resolve(completion('{"score":4,"feedback":"you connected evaluation metrics to the system goal.","strength":"clear metrics","focus":"add one trade-off","nextCue":"explain the constraint before your decision"}'));
    if (name === "interview_report") return Promise.resolve(completion(malformedReport ? "not valid json" : '{"overallScore":4,"summary":"you gave clear, practical answers.","strengths":["clear metrics"],"focusAreas":["trade-offs"],"nextSteps":["practise one system-design answer"]}'));
    return Promise.resolve(completion("resume summary"));
  });
}

async function startInterview() {
  return createCaller().interview.start({ name: "Test candidate", role: "AI engineer" });
}

async function submitRecordedTestAnswer(sessionId: string) {
  const uploaded = await createCaller().interview.submitAnswerChunk({ sessionId, uploadId: `test-${Math.random()}`, chunkIndex: 0, chunkCount: 1, audioBase64: Buffer.from("audio").toString("base64"), mimeType: "audio/webm" });
  if (!uploaded.complete || !uploaded.result) throw new Error("Expected a completed answer upload.");
  return uploaded.result;
}

describe("seekhao interview router error and fallback behavior", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Groq is the primary provider when GROQ_API_KEY is set. Platform-service
    // mock paths (transcription failures, malformed responses, difficulty
    // progression) stub the key off so the mocks stay authoritative.
    const envModule = (await import("./_core/env")) as unknown as { ENV: Record<string, string> };
    envModule.groqApiKey = "";
    vi.stubEnv("GROQ_API_KEY", "");
    await installMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("gives a truthful error when no speech service is configured on a self-hosted deploy", async () => {
    await installMocks({ forgeEnabled: false });
    const started = await startInterview();
    await expect(submitRecordedTestAnswer(started.sessionId)).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("GROQ_API_KEY") });
    expect(localStorageMock.localStoragePut).toHaveBeenCalled();
  });

  it("rejects an expired practice session before attempting an upload", async () => {
    await expect(submitRecordedTestAnswer("missing")).rejects.toMatchObject({ code: "NOT_FOUND", message: "this practice session has expired. start another one." });
    expect(mocks.storagePut).not.toHaveBeenCalled();
  });

  it("starts from bounded extracted resume text without transient upload state", async () => {
    const caller = createCaller();
    const started = await caller.interview.start({ name: "Test candidate", role: "AI engineer", resume: { name: "candidate.pdf", text: "Built retrieval systems with Python, LLM evaluation, and production APIs." } });

    expect(started.resumeUsed).toBe(true);
    expect(mocks.storagePut).not.toHaveBeenCalled();
  });

  it("propagates a transcription-service failure as a useful submission error", async () => {
    await setForgeConfigured(true);
    const started = await startInterview();
    mocks.transcribeAudio.mockResolvedValue({ error: "we could not transcribe that recording" });

    await expect(submitRecordedTestAnswer(started.sessionId)).rejects.toMatchObject({ code: "BAD_REQUEST", message: "we could not transcribe that recording" });
  });

  it("explains when the transcription service has exhausted its quota", async () => {
    await setForgeConfigured(true);
    const started = await startInterview();
    mocks.transcribeAudio.mockResolvedValue({ error: "Transcription service request failed", details: "412 Precondition Failed: your account has hit a usage exhausted" });

    await expect(submitRecordedTestAnswer(started.sessionId)).rejects.toMatchObject({ code: "BAD_REQUEST", message: "speech transcription is temporarily unavailable because its service quota has been reached. please try again later." });
  });

  it("uses Groq only when the primary transcription service reports exhausted quota", async () => {
    await setForgeConfigured(true);
    (await import("./_core/env")).ENV.groqApiKey = "test-key";
    const started = await startInterview();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ text: "I would measure retrieval quality with recall, faithfulness, latency, and cost." }) });
    vi.stubGlobal("fetch", fetchMock);
    mocks.transcribeAudio.mockResolvedValue({ error: "Transcription service request failed", details: "412 Precondition Failed: your account has hit a usage exhausted" });

    await expect(submitRecordedTestAnswer(started.sessionId)).resolves.toMatchObject({ transcript: "I would measure retrieval quality with recall, faithfulness, latency, and cost." });
    expect(fetchMock).toHaveBeenCalledWith("https://api.groq.com/openai/v1/audio/transcriptions", expect.objectContaining({ method: "POST" }));
    vi.unstubAllGlobals();
  });

  it("falls back to the quota message when the Groq transcription fallback also fails", async () => {
    (await import("./_core/env")).ENV.groqApiKey = "test-key";
    const started = await startInterview();
    const fetchMock = vi.fn(async (url: any, init: any) => {
      const urlStr = String(url);
      if (urlStr.includes("/audio/transcriptions")) return new Response(JSON.stringify({ error: { message: "rate limit" } }), { status: 429 });
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"question":"what would you monitor next?","focus":"trade-offs","followUpHint":"name one cost","summary":"resume summary"}' } }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    mocks.transcribeAudio.mockResolvedValue({ error: "Transcription service request failed", details: "412 Precondition Failed: your account has hit a usage exhausted" });

    try {
      await submitRecordedTestAnswer(started.sessionId);
      throw new Error("expected the answer upload to fail");
    } catch (error) {
      // submitAnswerChunk converts any transcription failure (including quota exhaustion
      // after the Groq fallback) into a retry-friendly message for the candidate.
      expect(error).toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("speech service") });
    }
    expect(fetchMock).toHaveBeenCalledWith("https://api.groq.com/openai/v1/audio/transcriptions", expect.objectContaining({ method: "POST" }));
    vi.unstubAllGlobals();
  }, 15_000);

  it("uses Groq for interview feedback only after the primary model reports exhausted quota", async () => {
    (await import("./_core/env")).ENV.groqApiKey = "test-key";
    const started = await startInterview();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => completion('{"score":4,"feedback":"you connected evaluation metrics to the system goal.","strength":"clear metrics","focus":"add one trade-off","nextCue":"explain the constraint before your decision"}') });
    vi.stubGlobal("fetch", fetchMock);
    mocks.invokeLLM.mockRejectedValueOnce(new Error('LLM invoke failed: 412 Precondition Failed – {"code":9,"message":"your account has hit a usage exhausted"}'));

    await expect(submitRecordedTestAnswer(started.sessionId)).resolves.toMatchObject({ feedback: { score: 4 } });
    expect(fetchMock).toHaveBeenCalledWith("https://api.groq.com/openai/v1/chat/completions", expect.objectContaining({ method: "POST" }));
    vi.unstubAllGlobals();
  });

  it("translates an ai-model failure into a retry message instead of an unhandled crash", async () => {
    // Groq primary, platform fallback unconfigured on self-hosted deployments:
    // the router converts the Groq failure into a user-facing INTERNAL_SERVER_ERROR
    // with retry guidance instead of leaking the raw "API key not configured" error.
    vi.unstubAllGlobals();
    (await import("./_core/env")).ENV.groqApiKey = "test-key";
    const started = await startInterview();
    // Route the stub by URL so storage-presign calls don't hang on the real
    // forge endpoint, Groq audio transcription succeeds, and the chat call
    // fails like a real service outage — isolating the failure to the LLM step.
    const fetchMock = vi.fn(async (url: any, init: any) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/storage/presign")) return new Response(JSON.stringify({ url: "https://storage.example/test-audio" }), { status: 200 });
      if (urlStr.includes("/audio/transcriptions")) return new Response(JSON.stringify({ text: "I would evaluate retrieval recall, faithfulness, latency, and cost." }), { status: 200 });
      return new Response(JSON.stringify({ error: { message: "service unavailable" } }), { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(submitRecordedTestAnswer(started.sessionId)).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "our ai hit a temporary problem. please retry this answer." });
    vi.unstubAllGlobals();
  }, 10_000);

  it("raises an overly harsh model score to the encouraging two-point floor", async () => {
    vi.unstubAllGlobals();
    (await import("./_core/env")).ENV.groqApiKey = "";
    vi.stubEnv("GROQ_API_KEY", "");
    // Neutral fetch stub so no leftover stub from a previous test can interfere
    // with mocked service calls in this scenario.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    const started = await startInterview();
    mocks.invokeLLM.mockImplementation((request: { response_format?: { json_schema?: { name?: string } } }) => {
      const name = request.response_format?.json_schema?.name;
      if (name === "answer_feedback") return Promise.resolve(completion('{"score":1,"feedback":"add more technical detail next time.","strength":"you started the answer","focus":"explain your approach","nextCue":"name one concrete decision"}'));
      return Promise.resolve(completion('{"question":"how would you evaluate a rag retrieval system?","focus":"retrieval quality","followUpHint":"name your metrics"}'));
    });

    await expect(submitRecordedTestAnswer(started.sessionId)).resolves.toMatchObject({ feedback: { score: 2 } });
  });

  it("uses the current transcript and intended difficulty when next-question work overlaps feedback", async () => {
    const started = await startInterview();

    await submitRecordedTestAnswer(started.sessionId);
    await submitRecordedTestAnswer(started.sessionId);

    const questionRequests = mocks.invokeLLM.mock.calls
      .map(([request]) => request as { response_format?: { json_schema?: { name?: string } }; messages?: Array<{ content?: string }> })
      .filter(request => request.response_format?.json_schema?.name === "interview_question");
    const thirdQuestionContext = questionRequests[1]?.messages?.[1]?.content;

    expect(thirdQuestionContext).toContain("question number: 3 of 5");
    expect(thirdQuestionContext).toContain("difficulty: intermediate");
    expect(thirdQuestionContext).toContain("A: I would evaluate retrieval recall, faithfulness, latency, and cost.");
  });

  it("combines ordered audio chunks before sending one complete recording for transcription", async () => {
    const started = await startInterview();
    const uploadId = "split-answer";
    const first = await createCaller().interview.submitAnswerChunk({ sessionId: started.sessionId, uploadId, chunkIndex: 0, chunkCount: 2, audioBase64: Buffer.from("au").toString("base64"), mimeType: "audio/webm" });
    const final = await createCaller().interview.submitAnswerChunk({ sessionId: started.sessionId, uploadId, chunkIndex: 1, chunkCount: 2, audioBase64: Buffer.from("dio").toString("base64"), mimeType: "audio/webm" });

    expect(first).toMatchObject({ complete: false, receivedChunks: 1, totalChunks: 2 });
    expect(final.complete).toBe(true);
    expect(final.result?.transcript).toContain("retrieval recall");
    expect(mocks.storagePut).toHaveBeenCalledTimes(1);
  });

  it("returns a safe report when the final structured AI response is malformed", async () => {
    installSuccessfulAiMocks({ malformedReport: true });
    const started = await startInterview();
    let finalResult: Awaited<ReturnType<typeof submitRecordedTestAnswer>> | undefined;

    for (let index = 0; index < 5; index += 1) {
      finalResult = await submitRecordedTestAnswer(started.sessionId);
    }

    expect(finalResult?.complete).toBe(true);
    expect(finalResult?.report?.summary).toBe("you completed a full spoken practice round. your next gains will come from making your decision process more visible.");
    expect(finalResult?.report?.nextSteps).toHaveLength(2);
  });
});

describe("openrouter json schema validation resilience", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const envModule = (await import("./_core/env")) as unknown as { ENV: Record<string, string> };
    envModule.groqApiKey = "";
    vi.stubEnv("GROQ_API_KEY", "gsk_test_transcription_key");
    vi.stubEnv("OPENROUTER_API_KEY", "sk_openrouter_test");
    await setForgeConfigured(false);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  }, 10_000);

  it("retries on the fallback model when the primary model returns 400 json_validate_failed and completes the answer", async () => {
    const calls: string[] = [];
    const responses: Array<{ url: string; body: string }> = [];
    globalThis.fetch = vi.fn(async (url: any, init: any) => {
      const urlStr = String(url);
      if (urlStr.includes("/audio/transcriptions")) {
        // Groq Whisper mock (GROQ_API_KEY is unset so the direct path needs
        // a fetch stub instead of an env key in this scenario).
        return new Response(JSON.stringify({ text: "I would evaluate retrieval recall, faithfulness, latency, and cost." }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (urlStr.includes("openrouter.ai/api/v1/chat/completions")) {
        const body = JSON.parse(init.body);
        calls.push(body.model);
        responses.push({ url, body: init.body });
        if (body.model === "google/gemini-3.7-flash") {
          return new Response(JSON.stringify({ error: { message: "Failed to validate JSON.", type: "invalid_request_error", code: "json_validate_failed", failed_generation: "" } }), { status: 400, headers: { "Content-Type": "application/json" } });
        }
        return new Response(JSON.stringify({ choices: [{ message: { content: '{"score":4,"feedback":"solid answer","strength":"clarity","focus":"add evidence","nextCue":"name your constraint"}' } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return Promise.reject(new Error("unexpected fetch"));
    });

    const started = await startInterview();
    const result = await submitRecordedTestAnswer(started.sessionId);

    // Two structured calls happen per answer (evaluation + next question):
    // each tries the primary model first and retries on the fallback.
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (let index = 0; index < calls.length; index += 2) {
      expect(calls[index]).toBe("google/gemini-3.7-flash");
      expect(calls[index + 1]).toBe("google/gemini-2.5-flash");
    }
    expect(result.feedback.score).toBe(4);
    expect(result.transcript).toContain("retrieval recall");

    const retryBody = JSON.parse(responses[1].body);
    expect(retryBody.model).toBe("google/gemini-2.5-flash");
    expect(retryBody.response_format).toEqual({ type: "json_object" });
  });
});

describe("groq transcription resilience", () => {
  it("retries transient groq 429 errors before giving up with a friendly message", async () => {
    const originalKey = (await import("./_core/env")).ENV.groqApiKey;
    (await import("./_core/env")).ENV.groqApiKey = "gsk_test_retry_key";
    const calls: number[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: any, init: any) => {
      const urlStr = String(url);
      if (urlStr.includes("/audio/transcriptions")) {
        calls.push(1);
        const status = calls.length <= 2 ? 429 : 200;
        const body = status === 200 ? JSON.stringify({ text: "retrieval recall matters most" }) : JSON.stringify({ error: { message: "rate limit" } });
        return new Response(body, { status });
      }
      if (urlStr.includes("/chat/completions")) {
        return new Response(JSON.stringify({ choices: [{ message: { content: '{"score":3,"feedback":"a reasonable start","strength":"clear intent","focus":"deeper detail","nextCue":"add an example"}' } }] }), { status: 200 });
      }
      return realFetch(url, init);
    }) as typeof fetch;
    try {
      const started = await startInterview();
      const result = await submitRecordedTestAnswer(started.sessionId);
      expect(result.complete).toBe(false);
      expect(result.transcript).toContain("retrieval recall");
      expect(calls.length).toBe(3);
    } finally {
      globalThis.fetch = realFetch;
      (await import("./_core/env")).ENV.groqApiKey = originalKey;
    }
  }, 30_000);
});
