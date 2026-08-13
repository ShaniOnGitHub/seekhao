import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { invokeLLM } from "./_core/llm";
import { systemRouter } from "./_core/systemRouter";
import { transcribeAudio } from "./_core/voiceTranscription";
import { publicProcedure, router } from "./_core/trpc";
import { isRoundComplete, MAX_QUESTIONS, normaliseScore, parseJson, questionNumberFor, roleFocus, type Feedback, type InterviewSession } from "./interview";
import { storageGetSignedUrl, storagePut } from "./storage";

const sessions = new Map<string, InterviewSession>();
const pendingResumeUploads = new Map<string, { name: string; mimeType: "application/pdf" | "text/plain"; chunks: Buffer[]; byteLength: number; createdAt: number }>();
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_RESUME_CHUNK_BYTES = 320 * 1024;
const SEEKHO_TEXT_MODEL = "gemini-3-flash-preview";

type QuestionResult = { question: string; focus: string; followUpHint: string };
type ReportResult = { overallScore: number; summary: string; strengths: string[]; focusAreas: string[]; nextSteps: string[] };

function extractContent(response: Awaited<ReturnType<typeof invokeLLM>>) {
  const content = response.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : "";
}

async function makeQuestion(session: InterviewSession): Promise<QuestionResult> {
  const questionNumber = questionNumberFor(session.answers.length);
  const prior = session.answers.length ? session.answers.map(answer => `Q: ${answer.question}\nA: ${answer.transcript}`).join("\n\n") : "none";
  const fallback = { question: `Tell me about a decision you would make in a ${session.role} role, and how you would know it was the right one.`, focus: roleFocus(session.role), followUpHint: "make your assumptions clear" };
  const response = await invokeLLM({
    model: SEEKHO_TEXT_MODEL,
    max_tokens: 1024,
    response_format: { type: "json_schema", json_schema: { name: "interview_question", strict: true, schema: { type: "object", properties: { question: { type: "string" }, focus: { type: "string" }, followUpHint: { type: "string" } }, required: ["question", "focus", "followUpHint"], additionalProperties: false } } },
    messages: [
      { role: "system", content: "You are seekho, a warm technical interview coach. Return JSON only. Ask one concise, spoken interview question. The question must be practical, specific, and answerable in under two minutes. Do not repeat prior topics." },
      { role: "user", content: `candidate: ${session.name}\ntarget role: ${session.role}\nrole focus: ${roleFocus(session.role)}\nresume context: ${session.resumeSummary || "no resume supplied"}\nquestion number: ${questionNumber} of ${MAX_QUESTIONS}\nprior answers: ${prior}\n\nReturn exactly: {"question":"...","focus":"...","followUpHint":"..."}` },
    ],
  });
  const result = parseJson(extractContent(response), fallback);
  return { question: result.question || fallback.question, focus: result.focus || fallback.focus, followUpHint: result.followUpHint || fallback.followUpHint };
}

async function evaluateAnswer(session: InterviewSession, question: string, transcript: string): Promise<Feedback> {
  const fallback: Feedback = { score: 3, feedback: "you gave a clear starting point. make one trade-off and one outcome more explicit next time.", strength: "you stayed on the question", focus: "name the evidence behind your choice", nextCue: "start with the context, then your decision" };
  const response = await invokeLLM({
    model: SEEKHO_TEXT_MODEL,
    max_tokens: 4096,
    response_format: { type: "json_schema", json_schema: { name: "answer_feedback", strict: true, schema: { type: "object", properties: { score: { type: "number" }, feedback: { type: "string" }, strength: { type: "string" }, focus: { type: "string" }, nextCue: { type: "string" } }, required: ["score", "feedback", "strength", "focus", "nextCue"], additionalProperties: false } } },
    messages: [
      { role: "system", content: "You are a precise, kind interview coach. Return JSON only. Judge the candidate answer for relevance, clarity, technical accuracy, and depth. Keep every value lowercase and conversational. Never invent details the candidate did not say." },
      { role: "user", content: `role: ${session.role}\nfocus: ${roleFocus(session.role)}\nquestion: ${question}\nanswer transcript: ${transcript}\n\nReturn exactly: {"score":1,"feedback":"one short sentence","strength":"one short phrase","focus":"one short phrase","nextCue":"one short sentence"}` },
    ],
  });
  const result = parseJson(extractContent(response), fallback);
  return { score: normaliseScore(result.score), feedback: result.feedback || fallback.feedback, strength: result.strength || fallback.strength, focus: result.focus || fallback.focus, nextCue: result.nextCue || fallback.nextCue };
}

async function makeReport(session: InterviewSession): Promise<ReportResult> {
  const average = session.answers.reduce((sum, answer) => sum + answer.feedback.score, 0) / Math.max(1, session.answers.length);
  const fallback: ReportResult = { overallScore: Math.round(average * 10) / 10, summary: "you completed a full spoken practice round. your next gains will come from making your decision process more visible.", strengths: session.answers.slice(0, 2).map(answer => answer.feedback.strength), focusAreas: session.answers.slice(0, 2).map(answer => answer.feedback.focus), nextSteps: ["repeat one answer using a clear situation, decision, and outcome", "practise naming your assumptions before you explain your solution"] };
  const responses = session.answers.map((answer, index) => `${index + 1}. ${answer.question}\nanswer: ${answer.transcript}\ncoach: ${answer.feedback.feedback}`).join("\n\n");
  const response = await invokeLLM({
    model: SEEKHO_TEXT_MODEL,
    max_tokens: 16384,
    response_format: { type: "json_schema", json_schema: { name: "interview_report", strict: true, schema: { type: "object", properties: { overallScore: { type: "number" }, summary: { type: "string" }, strengths: { type: "array", items: { type: "string" } }, focusAreas: { type: "array", items: { type: "string" } }, nextSteps: { type: "array", items: { type: "string" } } }, required: ["overallScore", "summary", "strengths", "focusAreas", "nextSteps"], additionalProperties: false } } },
    messages: [
      { role: "system", content: "You are seekho, an encouraging interview coach. Return JSON only. Create an honest final report based only on the supplied answers. Use lower-case, direct language. Keep the summary below 45 words." },
      { role: "user", content: `candidate: ${session.name}\nrole: ${session.role}\nanswers:\n${responses}\n\nReturn exactly: {"overallScore":4.2,"summary":"...","strengths":["...","..."],"focusAreas":["...","..."],"nextSteps":["...","..."]}` },
    ],
  });
  const result = parseJson(extractContent(response), fallback);
  return { overallScore: typeof result.overallScore === "number" ? result.overallScore : fallback.overallScore, summary: result.summary || fallback.summary, strengths: result.strengths?.length ? result.strengths : fallback.strengths, focusAreas: result.focusAreas?.length ? result.focusAreas : fallback.focusAreas, nextSteps: result.nextSteps?.length ? result.nextSteps : fallback.nextSteps };
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
    beginResumeUpload: publicProcedure.input(z.object({ name: z.string().min(1).max(180), mimeType: z.enum(["application/pdf", "text/plain"]) })).mutation(({ input }) => {
      const now = Date.now();
      for (const [id, upload] of Array.from(pendingResumeUploads.entries())) if (now - upload.createdAt > 10 * 60 * 1000) pendingResumeUploads.delete(id);
      const uploadId = nanoid();
      pendingResumeUploads.set(uploadId, { ...input, chunks: [], byteLength: 0, createdAt: now });
      return { uploadId };
    }),
    appendResumeUpload: publicProcedure.input(z.object({ uploadId: z.string().min(1), chunkBase64: z.string().min(1) })).mutation(({ input }) => {
      const upload = pendingResumeUploads.get(input.uploadId);
      if (!upload) throw new TRPCError({ code: "NOT_FOUND", message: "that resume upload has expired. choose the file again and retry." });
      const chunk = Buffer.from(input.chunkBase64, "base64");
      if (!chunk.byteLength || chunk.byteLength > MAX_RESUME_CHUNK_BYTES) throw new TRPCError({ code: "BAD_REQUEST", message: "that resume chunk could not be read. choose the file again and retry." });
      if (upload.byteLength + chunk.byteLength > MAX_FILE_BYTES) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "keep your resume under 5mb" });
      upload.chunks.push(chunk);
      upload.byteLength += chunk.byteLength;
      return { receivedBytes: upload.byteLength };
    }),
    completeResumeUpload: publicProcedure.input(z.object({ uploadId: z.string().min(1) })).mutation(async ({ input }) => {
      const upload = pendingResumeUploads.get(input.uploadId);
      if (!upload || !upload.byteLength) throw new TRPCError({ code: "NOT_FOUND", message: "that resume upload has expired. choose the file again and retry." });
      pendingResumeUploads.delete(input.uploadId);
      const stored = await storagePut(`seekho/resumes/${nanoid()}-${upload.name}`, Buffer.concat(upload.chunks), upload.mimeType);
      return { key: stored.key };
    }),
    start: publicProcedure.input(z.object({ name: z.string().trim().min(1).max(80), role: z.string().trim().min(2).max(120), resume: z.object({ name: z.string().max(180), mimeType: z.enum(["application/pdf", "text/plain"]), storageKey: z.string().min(1) }).optional() })).mutation(async ({ input }) => {
      let resumeSummary = "";
      if (input.resume) {
        if (!input.resume.storageKey.startsWith("seekho/resumes/")) throw new TRPCError({ code: "BAD_REQUEST", message: "the uploaded resume could not be found. choose it again and retry." });
        const signedUrl = await storageGetSignedUrl(input.resume.storageKey);
        const content = input.resume.mimeType === "text/plain"
          ? (await (await fetch(signedUrl)).text()).slice(0, 16_000)
          : [{ type: "file_url" as const, file_url: { url: signedUrl, mime_type: "application/pdf" as const } }];
        const resumeResponse = await invokeLLM({ model: SEEKHO_TEXT_MODEL, max_tokens: 1024, messages: [{ role: "system", content: "Summarise this resume in no more than 120 words for an interview coach. Focus on claimed experience, tools, projects, and seniority. Do not invent anything." }, { role: "user", content }] });
        resumeSummary = extractContent(resumeResponse).slice(0, 2_500);
      }
      const session: InterviewSession = { id: nanoid(), name: input.name, role: input.role, resumeSummary, questions: [], answers: [], createdAt: Date.now() };
      const first = await makeQuestion(session);
      session.questions.push(first.question);
      sessions.set(session.id, session);
      return { sessionId: session.id, questionNumber: 1, maxQuestions: MAX_QUESTIONS, question: first.question, focus: first.focus, resumeUsed: Boolean(resumeSummary) };
    }),
    submitAnswer: publicProcedure.input(z.object({ sessionId: z.string().min(1), audioBase64: z.string().min(1), mimeType: z.enum(["audio/webm", "audio/mp4", "audio/mpeg", "audio/wav", "audio/ogg"]) })).mutation(async ({ input }) => {
      const session = sessions.get(input.sessionId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "this practice session has expired. start another one." });
      const audio = Buffer.from(input.audioBase64, "base64");
      if (audio.byteLength > 16 * 1024 * 1024) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "keep each answer recording under 16mb" });
      const uploaded = await storagePut(`seekho/answers/${session.id}/${nanoid()}`, audio, input.mimeType);
      const signedUrl = await storageGetSignedUrl(uploaded.key);
      const transcription = await transcribeAudio({ audioUrl: signedUrl, language: "en", prompt: `Transcribe an interview answer for a ${session.role} role. Preserve technical terms such as RAG, LLM, LangChain, multimodal, and MCP.` });
      if ("error" in transcription) throw new TRPCError({ code: "BAD_REQUEST", message: transcription.error, cause: transcription });
      const question = session.questions[session.answers.length];
      if (!question) throw new TRPCError({ code: "CONFLICT", message: "all questions have already been completed" });
      const feedback = await evaluateAnswer(session, question, transcription.text);
      session.answers.push({ question, transcript: transcription.text, feedback });
      const complete = isRoundComplete(session.answers.length);
      if (complete) return { transcript: transcription.text, feedback, complete: true, report: await makeReport(session) };
      const next = await makeQuestion(session);
      session.questions.push(next.question);
      return { transcript: transcription.text, feedback, complete: false, nextQuestion: next.question, nextFocus: next.focus, questionNumber: questionNumberFor(session.answers.length), maxQuestions: MAX_QUESTIONS };
    }),
  }),
});

export type AppRouter = typeof appRouter;
