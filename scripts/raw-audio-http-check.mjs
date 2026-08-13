import { readFile } from "node:fs/promises";

const baseUrl = process.env.SEEKHO_BASE_URL || "http://localhost:3000";
const audio = await readFile("/tmp/seekho-answer.mp3");
const longAudio = Buffer.concat([audio, audio, audio, audio]);

const startedResponse = await fetch(`${baseUrl}/api/trpc/interview.start?batch=1`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ 0: { json: { name: "HTTP audio test", role: "AI engineer" } } }),
});
if (!startedResponse.ok) throw new Error(`Interview start failed: ${startedResponse.status} ${await startedResponse.text()}`);
const startedPayload = await startedResponse.json();
const started = startedPayload[0]?.result?.data?.json;
if (!started?.sessionId) throw new Error(`Interview start returned no session: ${JSON.stringify(startedPayload)}`);

const answerResponse = await fetch(`${baseUrl}/api/interview/audio?sessionId=${encodeURIComponent(started.sessionId)}`, {
  method: "POST",
  headers: { "content-type": "audio/mpeg" },
  body: longAudio,
});
const responseText = await answerResponse.text();
if (!answerResponse.ok) throw new Error(`Binary audio endpoint failed: ${answerResponse.status} ${responseText}`);
const answer = JSON.parse(responseText);
if (!answer.transcript || !answer.feedback?.feedback || !answer.nextQuestion) throw new Error(`Unexpected audio result: ${responseText}`);

console.log(JSON.stringify({ bytes: longAudio.byteLength, transcript: answer.transcript, nextQuestion: answer.nextQuestion }, null, 2));
