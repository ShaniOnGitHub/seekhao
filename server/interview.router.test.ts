import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invokeLLM: vi.fn(),
  storageGetSignedUrl: vi.fn(),
  storagePut: vi.fn(),
  transcribeAudio: vi.fn(),
}));

vi.mock("./_core/llm", () => ({ invokeLLM: mocks.invokeLLM }));
vi.mock("./_core/voiceTranscription", () => ({ transcribeAudio: mocks.transcribeAudio }));
vi.mock("./storage", () => ({ storageGetSignedUrl: mocks.storageGetSignedUrl, storagePut: mocks.storagePut }));

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
  beforeEach(() => {
    vi.clearAllMocks();
    // Groq is the primary provider when GROQ_API_KEY is set. Platform-service
    // mock paths (transcription failures, malformed responses, difficulty
    // progression) stub the key off so the mocks stay authoritative.
    vi.stubEnv("GROQ_API_KEY", "");
    mocks.storagePut.mockImplementation((key: string) => Promise.resolve({ key, url: `/manus-storage/${key}` }));
    mocks.storageGetSignedUrl.mockResolvedValue("https://storage.example/test-audio");
    mocks.transcribeAudio.mockResolvedValue({ text: "I would evaluate retrieval recall, faithfulness, latency, and cost." });
    installSuccessfulAiMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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
    const started = await startInterview();
    mocks.transcribeAudio.mockResolvedValue({ error: "we could not transcribe that recording" });

    await expect(submitRecordedTestAnswer(started.sessionId)).rejects.toMatchObject({ code: "BAD_REQUEST", message: "we could not transcribe that recording" });
  });

  it("explains when the transcription service has exhausted its quota", async () => {
    const started = await startInterview();
    mocks.transcribeAudio.mockResolvedValue({ error: "Transcription service request failed", details: "412 Precondition Failed: your account has hit a usage exhausted" });

    await expect(submitRecordedTestAnswer(started.sessionId)).rejects.toMatchObject({ code: "BAD_REQUEST", message: "speech transcription is temporarily unavailable because its service quota has been reached. please try again later." });
  });

  it("uses Groq only when the primary transcription service reports exhausted quota", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-key");
    const started = await startInterview();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ text: "I would measure retrieval quality with recall, faithfulness, latency, and cost." }) });
    vi.stubGlobal("fetch", fetchMock);
    mocks.transcribeAudio.mockResolvedValue({ error: "Transcription service request failed", details: "412 Precondition Failed: your account has hit a usage exhausted" });

    await expect(submitRecordedTestAnswer(started.sessionId)).resolves.toMatchObject({ transcript: "I would measure retrieval quality with recall, faithfulness, latency, and cost." });
    expect(fetchMock).toHaveBeenCalledWith("https://api.groq.com/openai/v1/audio/transcriptions", expect.objectContaining({ method: "POST" }));
    vi.unstubAllGlobals();
  });

  it("uses Groq for interview feedback only after the primary model reports exhausted quota", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-key");
    const started = await startInterview();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => completion('{"score":4,"feedback":"you connected evaluation metrics to the system goal.","strength":"clear metrics","focus":"add one trade-off","nextCue":"explain the constraint before your decision"}') });
    vi.stubGlobal("fetch", fetchMock);
    mocks.invokeLLM.mockRejectedValueOnce(new Error('LLM invoke failed: 412 Precondition Failed – {"code":9,"message":"your account has hit a usage exhausted"}'));

    await expect(submitRecordedTestAnswer(started.sessionId)).resolves.toMatchObject({ feedback: { score: 4 } });
    expect(fetchMock).toHaveBeenCalledWith("https://api.groq.com/openai/v1/chat/completions", expect.objectContaining({ method: "POST" }));
    vi.unstubAllGlobals();
  });

  it("translates an ai-model failure into a retry message instead of an unhandled crash", async () => {
    // With Groq enabled and the platform mock rejecting, the router converts the
    // failure into a user-facing INTERNAL_SERVER_ERROR with retry guidance.
    vi.stubEnv("GROQ_API_KEY", "test-key");
    const started = await startInterview();
    mocks.invokeLLM.mockImplementation(() => Promise.reject(new Error("LLM invoke failed: 500 – platform unavailable")));

    await expect(submitRecordedTestAnswer(started.sessionId)).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "our ai hit a temporary problem. please retry this answer." });
  });

  it("raises an overly harsh model score to the encouraging two-point floor", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
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
