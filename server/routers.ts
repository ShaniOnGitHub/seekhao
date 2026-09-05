import { COOKIE_NAME } from "../shared/const";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import { invokeLLM } from "./_core/llm";
import { systemRouter } from "./_core/systemRouter";
import { transcribeAudio } from "./_core/voiceTranscription";
import { publicProcedure, router } from "./_core/trpc";
import { chooseOpeningAngle, difficultyForQuestion, isRoundComplete, MAX_QUESTIONS, normaliseScore, openingQuestionForRole, parseJson, questionNumberFor, roleFocus, type Answer, type Feedback, type InterviewSession } from "./interview";
import { drawQuestionSeed, fallbackSeedForRole, formatSeedAsPromptBase } from "./questionBank";
import { storageGetSignedUrl, storagePut } from "./storage";
import { localStoragePut } from "./_core/localStorage";
import { invokeInterviewModel } from "./interviewService";

const sessions = new Map<string, InterviewSession>();
const MAX_ANSWER_BYTES = 16 * 1024 * 1024;
const MAX_ANSWER_CHUNK_BASE64_CHARS = 60_000;
const ANSWER_UPLOAD_TTL_MS = 5 * 60 * 1000;
const SEEKHAO_TEXT_MODEL = "gemini-3-flash-preview";

export type AudioMimeType = "audio/webm" | "audio/mp4" | "audio/mpeg" | "audio/wav" | "audio/ogg";
type PendingAnswerUpload = { sessionId: string; mimeType: AudioMimeType; chunkCount: number; nextChunkIndex: number; chunks: Buffer[]; totalBytes: number; createdAt: number };
const pendingAnswerUploads = new Map<string, PendingAnswerUpload>();

type QuestionResult = { question: string; focus: string; followUpHint: string };
type ReportResult = { overallScore: number; summary: string; strengths: string[]; focusAreas: string[]; nextSteps: string[] };



// Direct in-memory transcription. Recordings are never persisted anywhere.
async function transcribeDirectly(audio: Buffer, mimeType: AudioMimeType, prompt: string) {
  const apiKey = ENV.groqApiKey || process.env.GROQ_API_KEY;
  const extension = { "audio/webm": "webm", "audio/mp4": "mp4", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/ogg": "ogg" }[mimeType];
  const audioBytes = new Uint8Array(audio.byteLength);
  audioBytes.set(audio);
  const form = new FormData();
  form.set("file", new Blob([audioBytes], { type: mimeType }), `seekhao-answer.${extension}`);
  form.set("model", "whisper-large-v3-turbo");
  form.set("language", "en");
  form.set("prompt", prompt);
  form.set("response_format", "json");
  if (!apiKey) console.warn("[transcribeDirectly] groq disabled: GROQ_API_KEY missing in runtime");
  const quotaMessage = "we couldn't transcribe your answer right now — the speech service is briefly at capacity. wait a moment and press \"answer out loud\" again.";
  if (apiKey) {
    const attempts = 3;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form });
        if (response.ok) {
          const payload = await response.json() as { text?: unknown };
          if (typeof payload.text === "string" && payload.text.trim()) return payload.text.trim();
        } else if (response.status === 429 || response.status >= 500) {
          // Rate limit or transient Groq error — retry after a short backoff.
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          if (attempt === attempts) throw new TRPCError({ code: "BAD_REQUEST", message: quotaMessage });
        } else {
          // Non-retryable Groq response (e.g. 400 invalid audio) — fall through to the platform service.
          break;
        }
      } catch (error) {
        if (error instanceof TRPCError && error.message === quotaMessage) throw error;
        // Fall through to the platform service when Groq is unavailable.
        break;
      }
    }
  }
  // On self-hosted deployments (e.g. Render) the Manus Forge keys are not
  // present, so the platform storage and transcription services are skipped:
  // audio is stored on the instance's local filesystem (served via
  // /storage-local/*) and Groq Whisper (set GROQ_API_KEY) transcribes it.
  const forgeConfigured = Boolean(ENV.forgeApiUrl && ENV.forgeApiKey);
  let transcription: Awaited<ReturnType<typeof transcribeAudio>> | undefined;
  if (forgeConfigured) {
    const uploaded = await storagePut(`seekhao/answers/temp/${nanoid()}`, audio, mimeType);
    const signedUrl = await storageGetSignedUrl(uploaded.key);
    transcription = await transcribeAudio({ audioUrl: signedUrl, language: "en", prompt });
  } else {
    await localStoragePut(`seekhao/answers/temp/${nanoid()}`, audio);
  }
  if (transcription && "error" in transcription) {
    const quotaExhausted = transcription.details?.includes("usage exhausted");
    // When the platform service has exhausted its quota, fall back to Groq Whisper
    // so a real Groq key keeps the practice room working even without platform quota.
    if (quotaExhausted && (apiKey || process.env.GROQ_API_KEY)) {
      try {
        const extension = { "audio/webm": "webm", "audio/mp4": "mp4", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/ogg": "ogg" }[mimeType];
        const groqAudioBytes = new Uint8Array(audio.byteLength);
        groqAudioBytes.set(audio);
        const groqForm = new FormData();
        groqForm.set("file", new Blob([groqAudioBytes], { type: mimeType }), `seekhao-answer.${extension}`);
        groqForm.set("model", "whisper-large-v3-turbo");
        groqForm.set("language", "en");
        groqForm.set("prompt", prompt);
        groqForm.set("response_format", "json");
        const groqKey = apiKey || process.env.GROQ_API_KEY;
        const groqResponse = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${groqKey}` }, body: groqForm });
        if (groqResponse.ok) {
          const groqPayload = await groqResponse.json() as { text?: unknown };
          if (typeof groqPayload.text === "string" && groqPayload.text.trim()) return groqPayload.text.trim();
        }
      } catch {
        // Groq fallback failed; keep the original platform error below.
      }
    }
    if (quotaExhausted) {
      const keyNote = apiKey || process.env.GROQ_API_KEY ? " configure your GROQ_API_KEY so practice never depends on the shared quota." : "";
      throw new TRPCError({ code: "BAD_REQUEST", message: "speech transcription is temporarily unavailable because its service quota has been reached. please try again later." + (keyNote ? keyNote : ""), cause: transcription });
    }
    throw new TRPCError({ code: "BAD_REQUEST", message: transcription.error, cause: transcription });
  }
  if (!transcription) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "we couldn't transcribe your answer — the speech service is not configured. make sure GROQ_API_KEY is set." });
  }
  return transcription.text.trim();
}

function extractContent(response: Awaited<ReturnType<typeof invokeLLM>>) {
  const content = response.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : "";
}

async function makeQuestion(session: InterviewSession, priorAnswers: Pick<Answer, "question" | "transcript">[] = session.answers): Promise<QuestionResult> {
  const questionNumber = questionNumberFor(priorAnswers.length);
  const difficulty = difficultyForQuestion(questionNumber);
  const prior = priorAnswers.length ? priorAnswers.map(answer => `Q: ${answer.question}\nA: ${answer.transcript}`).join("\n\n") : "none";
  // Topic is drawn from a curated bank, sampled without replacement both within
  // this session and across previous sessions, so 10-20 practice rounds never
  // feel repetitive. The model composes the final wording around the seed.
  const seed = drawQuestionSeed(session.role, session.questions);
  const fallbackSeed = fallbackSeedForRole(session.role);
  const fallback = { question: `${seed.framing} a real example from your experience with ${seed.topic} in a ${session.role} role, and what outcome it led to.`, focus: roleFocus(session.role), followUpHint: seed.why };
  const response = await invokeInterviewModel({
    model: SEEKHAO_TEXT_MODEL,
    max_tokens: 400,
    response_format: { type: "json_schema", json_schema: { name: "interview_question", strict: true, schema: { type: "object", properties: { question: { type: "string" }, focus: { type: "string" }, followUpHint: { type: "string" } }, required: ["question", "focus", "followUpHint"], additionalProperties: false } } },
    messages: [
      { role: "system", content: "You are seekhao, a warm technical interview coach. Return JSON only. Ask one concise, spoken interview question. The question must be practical, specific, grounded in the candidate's real experience, and answerable in under two minutes. Never repeat the exact questions or topics already asked earlier in this session: the prior answers list every question asked so far, and you must pick a different topic and angle from all of them. Also vary your wording style and framing across questions — mix \"tell me about\", \"walk me through\", \"when have you\", \"how would you\", and \"compare or choose between\" framings so repeated sessions never sound identical. Respect the requested difficulty: easy means familiar fundamentals and clear examples; intermediate means applied reasoning; advanced means trade-offs and system decisions; challenging means nuanced constraints and judgement. The assigned topic and framing style below are the anchor for this question — build the question around them and keep it sensible for the stated role; do not invent topics unrelated to the role focus." },
      { role: "user", content: `candidate: ${session.name}\ntarget role: ${session.role}\nrole focus: ${roleFocus(session.role)}\nresume context: ${session.resumeSummary || "no resume supplied"}\nquestion number: ${questionNumber} of ${MAX_QUESTIONS}\ndifficulty: ${difficulty}\nassigned question seed:\n${formatSeedAsPromptBase(seed, session.role)}\nprior answers (question asked then answer given): ${prior}\n\nReturn exactly: {"question":"...","focus":"...","followUpHint":"..."}` },
    ],
  });
  const result = parseJson(extractContent(response), fallback);
  const finalQuestion = result.question || fallback.question;
  return { question: finalQuestion, focus: result.focus || fallback.focus, followUpHint: result.followUpHint || fallback.followUpHint };
}

async function evaluateAnswer(session: InterviewSession, question: string, transcript: string): Promise<Feedback> {
  const fallback: Feedback = { score: 3, feedback: "you gave a clear starting point. make one trade-off and one outcome more explicit next time.", strength: "you stayed on the question", focus: "name the evidence behind your choice", nextCue: "start with the context, then your decision" };
  const response = await invokeInterviewModel({
    model: SEEKHAO_TEXT_MODEL,
    max_tokens: 500,
    response_format: { type: "json_schema", json_schema: { name: "answer_feedback", strict: true, schema: { type: "object", properties: { score: { type: "number" }, feedback: { type: "string" }, strength: { type: "string" }, focus: { type: "string" }, nextCue: { type: "string" } }, required: ["score", "feedback", "strength", "focus", "nextCue"], additionalProperties: false } } },
    messages: [
      { role: "system", content: "You are a precise, kind interview coach. Return JSON only. Judge the candidate answer for relevance, clarity, technical accuracy, and depth. Keep every value lowercase and conversational. Never invent details the candidate did not say. Use only whole-number scores from 2 to 5: give 2 only when an answer has almost no useful substance or is clearly off-topic; give 3 for any basic or slightly correct on-topic answer; give 4 when an answer gives a reasonably correct explanation with more than one relevant technical choice, metric, or trade-off; give 5 only for an excellent, technically sound answer." },
      { role: "user", content: `role: ${session.role}\nfocus: ${roleFocus(session.role)}\nquestion: ${question}\nanswer transcript: ${transcript}\n\nReturn exactly: {"score":2,"feedback":"one short sentence","strength":"one short phrase","focus":"one short phrase","nextCue":"one short sentence"}` },
    ],
  });
  const result = parseJson(extractContent(response), fallback);
  return { score: normaliseScore(result.score), feedback: result.feedback || fallback.feedback, strength: result.strength || fallback.strength, focus: result.focus || fallback.focus, nextCue: result.nextCue || fallback.nextCue };
}

async function makeReport(session: InterviewSession): Promise<ReportResult> {
  const average = session.answers.reduce((sum, answer) => sum + answer.feedback.score, 0) / Math.max(1, session.answers.length);
  const fallback: ReportResult = { overallScore: Math.round(average * 10) / 10, summary: "you completed a full spoken practice round. your next gains will come from making your decision process more visible.", strengths: session.answers.slice(0, 2).map(answer => answer.feedback.strength), focusAreas: session.answers.slice(0, 2).map(answer => answer.feedback.focus), nextSteps: ["repeat one answer using a clear situation, decision, and outcome", "practise naming your assumptions before you explain your solution"] };
  const responses = session.answers.map((answer, index) => `${index + 1}. ${answer.question}\nanswer: ${answer.transcript}\ncoach: ${answer.feedback.feedback}`).join("\n\n");
  const response = await invokeInterviewModel({
    model: SEEKHAO_TEXT_MODEL,
    max_tokens: 800,
    response_format: { type: "json_schema", json_schema: { name: "interview_report", strict: true, schema: { type: "object", properties: { overallScore: { type: "number" }, summary: { type: "string" }, strengths: { type: "array", items: { type: "string" } }, focusAreas: { type: "array", items: { type: "string" } }, nextSteps: { type: "array", items: { type: "string" } } }, required: ["overallScore", "summary", "strengths", "focusAreas", "nextSteps"], additionalProperties: false } } },
    messages: [
      { role: "system", content: "You are seekhao, an encouraging interview coach. Return JSON only. Create an honest final report based only on the supplied answers. Use lower-case, direct language. Keep the summary below 45 words." },
      { role: "user", content: `candidate: ${session.name}\nrole: ${session.role}\nanswers:\n${responses}\n\nReturn exactly: {"overallScore":4.2,"summary":"...","strengths":["...","..."],"focusAreas":["...","..."],"nextSteps":["...","..."]}` },
    ],
  });
  const result = parseJson(extractContent(response), fallback);
  return { overallScore: typeof result.overallScore === "number" ? result.overallScore : fallback.overallScore, summary: result.summary || fallback.summary, strengths: result.strengths?.length ? result.strengths : fallback.strengths, focusAreas: result.focusAreas?.length ? result.focusAreas : fallback.focusAreas, nextSteps: result.nextSteps?.length ? result.nextSteps : fallback.nextSteps };
}

async function processUploadedAnswer(session: InterviewSession, audio: Buffer, mimeType: AudioMimeType) {
  const prompt = `Transcribe an interview answer for a ${session.role} role. Preserve technical terms such as RAG, LLM, LangChain, multimodal, and MCP.`;
  let transcript: string;
  try {
    transcript = await transcribeDirectly(audio, mimeType, prompt);
  } catch (error) {
    console.error("[seekhao] transcribeDirectly failed:", error instanceof Error ? error.message : error);
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({ code: "BAD_REQUEST", message: "we couldn't transcribe your answer. please record it again.", cause: error });
  }
  if (!transcript) throw new TRPCError({ code: "BAD_REQUEST", message: "your recording was empty. try speaking a little closer to the microphone." });
  const question = session.questions[session.answers.length];
  if (!question) throw new TRPCError({ code: "CONFLICT", message: "all questions have already been completed" });
  const aiError = new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "our ai hit a temporary problem. please retry this answer." });
  let feedback: Feedback;
  try {
    feedback = await evaluateAnswer(session, question, transcript);
  } catch (error) {
    console.error("[seekhao] evaluateAnswer failed:", error instanceof Error ? error.message : error);
    throw aiError;
  }
  const nextQuestionTask = isRoundComplete(session.answers.length + 1)
    ? Promise.resolve<{ question: string; focus: string; followUpHint: string } | null>(null)
    : makeQuestion(session, [...session.answers, { question, transcript }]);
  session.answers.push({ question, transcript, feedback });
  const complete = isRoundComplete(session.answers.length);
  if (complete) {
    let report: ReportResult;
    try {
      report = await makeReport(session);
    } catch {
      throw aiError;
    }
    return { transcript, feedback, complete: true, report };
  }
  let next: { question: string; focus: string; followUpHint: string };
  try {
    const nextQuestion = await nextQuestionTask;
    if (!nextQuestion) throw aiError;
    next = nextQuestion;
  } catch {
    throw aiError;
  }
  session.questions.push(next.question);
  return { transcript, feedback, complete: false, nextQuestion: next.question, nextFocus: next.focus, questionNumber: questionNumberFor(session.answers.length), maxQuestions: MAX_QUESTIONS };
}

export async function submitRecordedAnswer(sessionId: string, audio: Buffer, mimeType: AudioMimeType) {
  const session = sessions.get(sessionId);
  if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "this practice session has expired. start another one." });
  if (!audio.byteLength) throw new TRPCError({ code: "BAD_REQUEST", message: "we didn't receive an audio sample. check your microphone permission and try again." });
  if (audio.byteLength > MAX_ANSWER_BYTES) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "keep each answer recording under 16mb" });
  return processUploadedAnswer(session, audio, mimeType);
}

function discardExpiredAnswerUploads() {
  const cutoff = Date.now() - ANSWER_UPLOAD_TTL_MS;
  pendingAnswerUploads.forEach((upload, uploadId) => {
    if (upload.createdAt < cutoff) pendingAnswerUploads.delete(uploadId);
  });
}

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  interview: router({
    start: publicProcedure.input(z.object({ name: z.string().trim().min(1).max(80), role: z.string().trim().min(2).max(120), resume: z.object({ name: z.string().max(180), text: z.string().trim().min(1).max(16_000) }).optional() })).mutation(async ({ input }) => {
      const session: InterviewSession = { id: nanoid(), name: input.name, role: input.role, resumeSummary: input.resume?.text.slice(0, 2_500) ?? "", questions: [], answers: [], createdAt: Date.now() };
      // The opening question is drawn from the same randomized bank so the
      // first thing a user hears varies across practice rounds.
      const openingSeed = drawQuestionSeed(session.role, session.questions);
      const first = openingQuestionForRole(session.role, chooseOpeningAngle(), openingSeed.topic);
      session.questions.push(first.question);
      sessions.set(session.id, session);
      return { sessionId: session.id, questionNumber: 1, maxQuestions: MAX_QUESTIONS, question: first.question, focus: first.focus, resumeUsed: Boolean(input.resume) };
    }),
    submitAnswerChunk: publicProcedure.input(z.object({ sessionId: z.string().min(1), uploadId: z.string().min(1).max(100), chunkIndex: z.number().int().min(0).max(512), chunkCount: z.number().int().min(1).max(512), mimeType: z.enum(["audio/webm", "audio/mp4", "audio/mpeg", "audio/wav", "audio/ogg"]), audioBase64: z.string().min(1).max(MAX_ANSWER_CHUNK_BASE64_CHARS) })).mutation(async ({ input }) => {
      discardExpiredAnswerUploads();
      if (!sessions.has(input.sessionId)) throw new TRPCError({ code: "NOT_FOUND", message: "this practice session has expired. start another one." });
      const audio = Buffer.from(input.audioBase64, "base64");
      if (!audio.byteLength) throw new TRPCError({ code: "BAD_REQUEST", message: "we didn't receive an audio sample. check your microphone permission and try again." });
      let upload = pendingAnswerUploads.get(input.uploadId);
      if (!upload) {
        if (input.chunkIndex !== 0) throw new TRPCError({ code: "CONFLICT", message: "the recording upload expired. record your answer again and retry." });
        upload = { sessionId: input.sessionId, mimeType: input.mimeType, chunkCount: input.chunkCount, nextChunkIndex: 0, chunks: [], totalBytes: 0, createdAt: Date.now() };
        pendingAnswerUploads.set(input.uploadId, upload);
      }
      if (upload.sessionId !== input.sessionId || upload.mimeType !== input.mimeType || upload.chunkCount !== input.chunkCount || input.chunkIndex !== upload.nextChunkIndex) {
        pendingAnswerUploads.delete(input.uploadId);
        if (input.sessionId && !sessions.has(input.sessionId)) throw new TRPCError({ code: "NOT_FOUND", message: "this practice session has expired. start another one." });
        throw new TRPCError({ code: "CONFLICT", message: "this upload's chunks arrived out of order — it was interrupted. record your answer again and retry." });
      }
      if (upload.totalBytes + audio.byteLength > MAX_ANSWER_BYTES) {
        pendingAnswerUploads.delete(input.uploadId);
        throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "keep each answer recording under 16mb" });
      }
      upload.chunks.push(audio);
      upload.totalBytes += audio.byteLength;
      upload.nextChunkIndex += 1;
      if (upload.nextChunkIndex < upload.chunkCount) return { complete: false, receivedChunks: upload.nextChunkIndex, totalChunks: upload.chunkCount };
      pendingAnswerUploads.delete(input.uploadId);
      return { complete: true, receivedChunks: upload.chunkCount, totalChunks: upload.chunkCount, result: await submitRecordedAnswer(input.sessionId, Buffer.concat(upload.chunks), input.mimeType) };
    }),
  }),
});

export type AppRouter = typeof appRouter;
