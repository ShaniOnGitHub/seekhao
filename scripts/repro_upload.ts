// Reproduces the interview start + chunked upload flow against the local server
import { randomUUID } from "crypto";

const BASE = "http://localhost:3000/api/trpc";

async function call(method: string, input: unknown) {
  const url = new URL(`/api/trpc/${method}`, BASE);
  url.searchParams.set("batch", "1");
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ 0: { json: input } }),
  });
  const text = await res.text();
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return { status: res.status, raw: text }; }
  const arr = parsed as Array<{ error?: unknown; result?: unknown }>;
  return { status: res.status, payload: arr?.[0] ?? parsed };
}

async function main() {
  // 1. Start interview (like the "start my practice" button) with resume context
  const start = await call("interview.start", { name: "shani", role: "ai engineer", resume: { name: "roshaan_resume_dev.pdf", text: "Senior engineer experienced with LLMs, RAG pipelines, LangChain and MCP integrations." } });
  console.log("start:", JSON.stringify(start, null, 1));

  const sessionId = (start.payload as { result?: { data?: { json?: { sessionId?: string } } } })?.result?.data?.json?.sessionId;
  if (!sessionId) { console.log("could not get sessionId"); return; }

  // 2. Simulate a tiny valid-ish webm recording (webm header only, very small)
  // Minimal webm container: EBML header + Segment with Audio element.
  const webmHeader = Buffer.from([
    0x1a, 0x45, 0xdf, 0xa3, // EBML
    0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x23, // size
    0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01,
    0x42, 0xf2, 0x81, 0x04, 0x42, 0xf3, 0x81, 0x08,
    0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d,
    0x18, 0x53, 0x80, 0x67, // Segment (unknown size)
    0x16, 0x54, 0xae, 0x6b, // Segment Info
  ]);
  const audioBlob = Buffer.concat([
    webmHeader,
    // some silence-ish payload (valid-ish opus in simple block)
    Buffer.alloc(60_000, 0x11),
  ]);
  const audioBase64 = audioBlob.toString("base64");
  const CHUNK = 56_000;
  const totalChunks = Math.ceil(audioBase64.length / CHUNK);
  const uploadId = randomUUID();
  console.log("audio bytes:", audioBlob.byteLength, "chunks:", totalChunks);

  for (let i = 0; i < totalChunks; i++) {
    const chunk = await call("interview.submitAnswerChunk", {
      sessionId,
      uploadId,
      chunkIndex: i,
      chunkCount: totalChunks,
      mimeType: "audio/webm",
      audioBase64: audioBase64.slice(i * CHUNK, (i + 1) * CHUNK),
    });
    console.log(`chunk ${i + 1}/${totalChunks}:`, JSON.stringify(chunk.payload));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
