import { readFile } from "node:fs/promises";
import { appRouter } from "../server/routers.ts";

const audio = (await readFile("/tmp/seekhao-answer.mp3")).toString("base64");
const chunkLength = 56_000;
const caller = appRouter.createCaller({
  user: null,
  req: { protocol: "https", headers: {} },
  res: { clearCookie: () => {} },
});

const started = await caller.interview.start({
  name: "Voice test candidate",
  role: "AI engineer",
  resume: {
    name: "voice-test-resume.txt",
    text: "AI engineer with hands-on experience shipping retrieval-augmented generation prototypes, model evaluations, and Python services.",
  },
});

if (!/ai|data|automation|project/i.test(started.question)) {
  throw new Error(`Expected an approachable AI-engineering opening question, received: ${started.question}`);
}
if (!started.resumeUsed) {
  throw new Error("Expected the supplied text resume to be accepted and used for the interview context.");
}

let result;
for (let index = 0; index < started.maxQuestions; index += 1) {
  const uploadId = `voice-e2e-${index}`;
  const totalChunks = Math.ceil(audio.length / chunkLength);
  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
    const uploaded = await caller.interview.submitAnswerChunk({ sessionId: started.sessionId, uploadId, chunkIndex, chunkCount: totalChunks, mimeType: "audio/mpeg", audioBase64: audio.slice(chunkIndex * chunkLength, (chunkIndex + 1) * chunkLength) });
    if (chunkIndex === totalChunks - 1) result = uploaded.result;
  }
  if (!result) throw new Error(`Expected a completed audio upload at question ${index + 1}.`);

  if (!result.transcript || !/rag|retrieval|faithfulness/i.test(result.transcript)) {
    throw new Error(`Expected a meaningful transcription at question ${index + 1}, received: ${result.transcript}`);
  }
  if (!result.feedback?.feedback || result.feedback.score < 2 || result.feedback.score > 5) {
    throw new Error(`Expected usable coaching feedback at question ${index + 1}.`);
  }
  if (result.feedback.feedback === "you gave a clear starting point. make one trade-off and one outcome more explicit next time.") {
    throw new Error(`Expected live AI coaching rather than fallback feedback at question ${index + 1}.`);
  }
  if (index < started.maxQuestions - 1 && !result.nextQuestion) {
    throw new Error(`Expected a next question after answer ${index + 1}.`);
  }
}

if (!result?.complete || !result.report?.summary || !result.report.nextSteps?.length) {
  throw new Error("Expected the fifth response to return a complete final report.");
}
if (result.report.summary === "you completed a full spoken practice round. your next gains will come from making your decision process more visible.") {
  throw new Error("Expected a live AI final report rather than fallback report copy.");
}

console.log(JSON.stringify({
  openingQuestion: started.question,
  finalTranscript: result.transcript,
  finalScore: result.feedback.score,
  reportSummary: result.report.summary,
}, null, 2));
