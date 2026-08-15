import { readFile } from "node:fs/promises";

const baseUrl = process.env.SEEKHAO_BASE_URL || "http://localhost:3000";
const audio = await readFile("/tmp/seekhao-answer.mp3");
const repeats = Math.max(1, Number(process.env.SEEKHAO_AUDIO_REPEATS || "4"));
const longAudio = Buffer.concat(Array.from({ length: repeats }, () => audio));
const audioBase64 = longAudio.toString("base64");
const chunkLength = 56_000;
const skipFinalChunk = process.env.SEEKHAO_SKIP_FINAL_CHUNK === "1";

const startedResponse = await fetch(`${baseUrl}/api/trpc/interview.start?batch=1`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ 0: { json: { name: "HTTP audio test", role: "AI engineer" } } }),
});
if (!startedResponse.ok) throw new Error(`Interview start failed: ${startedResponse.status} ${await startedResponse.text()}`);
const startedPayload = await startedResponse.json();
const started = startedPayload[0]?.result?.data?.json;
if (!started?.sessionId) throw new Error(`Interview start returned no session: ${JSON.stringify(startedPayload)}`);

const uploadId = crypto.randomUUID();
const totalChunks = Math.ceil(audioBase64.length / chunkLength);
let answer;
const chunksToSend = skipFinalChunk ? totalChunks - 1 : totalChunks;
for (let chunkIndex = 0; chunkIndex < chunksToSend; chunkIndex += 1) {
  const answerResponse = await fetch(`${baseUrl}/api/trpc/interview.submitAnswerChunk?batch=1`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ 0: { json: { sessionId: started.sessionId, uploadId, chunkIndex, chunkCount: totalChunks, mimeType: "audio/mpeg", audioBase64: audioBase64.slice(chunkIndex * chunkLength, (chunkIndex + 1) * chunkLength) } } }),
  });
  const responseText = await answerResponse.text();
  if (!answerResponse.ok) throw new Error(`JSON audio chunk ${chunkIndex + 1} failed: ${answerResponse.status} ${responseText}`);
  const payload = JSON.parse(responseText)[0]?.result?.data?.json;
  if (chunkIndex === totalChunks - 1) answer = payload?.result;
}
if (skipFinalChunk) {
  console.log(JSON.stringify({ bytes: longAudio.byteLength, submittedChunks: chunksToSend, totalChunks, status: "all intermediate chunks reached the JSON endpoint" }, null, 2));
  process.exit(0);
}
if (!answer?.transcript || !answer.feedback?.feedback || !answer.nextQuestion) throw new Error("The final audio chunk did not return an interview answer.");

console.log(JSON.stringify({ bytes: longAudio.byteLength, transcript: answer.transcript, nextQuestion: answer.nextQuestion }, null, 2));
