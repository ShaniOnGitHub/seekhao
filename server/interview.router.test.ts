import { beforeEach, describe, expect, it, vi } from "vitest";

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

async function submitStagedAnswer(sessionId: string) {
  const caller = createCaller();
  const upload = await caller.interview.beginAnswerUpload({ sessionId, mimeType: "audio/webm" });
  await caller.interview.appendAnswerUpload({ uploadId: upload.uploadId, chunkBase64: Buffer.from("audio").toString("base64") });
  return caller.interview.submitAnswer({ sessionId, uploadId: upload.uploadId });
}

describe("seekho interview router error and fallback behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.storagePut.mockImplementation((key: string) => Promise.resolve({ key, url: `/manus-storage/${key}` }));
    mocks.storageGetSignedUrl.mockResolvedValue("https://storage.example/test-audio");
    mocks.transcribeAudio.mockResolvedValue({ text: "I would evaluate retrieval recall, faithfulness, latency, and cost." });
    installSuccessfulAiMocks();
  });

  it("rejects an expired practice session before attempting an upload", async () => {
    await expect(createCaller().interview.beginAnswerUpload({ sessionId: "missing", mimeType: "audio/webm" })).rejects.toMatchObject({ code: "NOT_FOUND", message: "this practice session has expired. start another one." });
    expect(mocks.storagePut).not.toHaveBeenCalled();
  });

  it("stores staged resume chunks and starts from the stored resume reference", async () => {
    const caller = createCaller();
    const upload = await caller.interview.beginResumeUpload({ name: "candidate.pdf", mimeType: "application/pdf" });
    await caller.interview.appendResumeUpload({ uploadId: upload.uploadId, chunkBase64: Buffer.from("resume bytes").toString("base64") });
    const stored = await caller.interview.completeResumeUpload({ uploadId: upload.uploadId });
    const started = await caller.interview.start({ name: "Test candidate", role: "AI engineer", resume: { name: "candidate.pdf", mimeType: "application/pdf", storageKey: stored.key } });

    expect(started.resumeUsed).toBe(true);
    expect(mocks.storageGetSignedUrl).toHaveBeenCalledWith(stored.key);
    expect(mocks.storagePut).toHaveBeenCalledTimes(1);
  });

  it("propagates a transcription-service failure as a useful submission error", async () => {
    const started = await startInterview();
    mocks.transcribeAudio.mockResolvedValue({ error: "we could not transcribe that recording" });

    await expect(submitStagedAnswer(started.sessionId)).rejects.toMatchObject({ code: "BAD_REQUEST", message: "we could not transcribe that recording" });
  });

  it("returns a safe report when the final structured AI response is malformed", async () => {
    installSuccessfulAiMocks({ malformedReport: true });
    const started = await startInterview();
    let finalResult: Awaited<ReturnType<ReturnType<typeof createCaller>["interview"]["submitAnswer"]>> | undefined;

    for (let index = 0; index < 5; index += 1) {
      finalResult = await submitStagedAnswer(started.sessionId);
    }

    expect(finalResult?.complete).toBe(true);
    expect(finalResult?.report?.summary).toBe("you completed a full spoken practice round. your next gains will come from making your decision process more visible.");
    expect(finalResult?.report?.nextSteps).toHaveLength(2);
  });
});
