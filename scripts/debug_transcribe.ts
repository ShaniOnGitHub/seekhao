// Debug-only helper: exercises the full transcription path used by submitAnswerChunk
// so the fallback chain can be verified against the actual runtime env.
import "dotenv/config";
import { transcribeAudio } from "../server/_core/voiceTranscription";
import { storagePut, storageGetSignedUrl } from "../server/storage";
import { ENV } from "../server/_core/env";
import { nanoid } from "nanoid";
console.log("forgeApiUrl set:", Boolean(ENV.forgeApiUrl));
console.log("groqApiKey set:", Boolean(ENV.groqApiKey));
try {
  const audio = Buffer.from("RIFF....small fake webm....");
  const uploaded = await storagePut(`seekhao/answers/temp/${nanoid()}`, audio, "audio/webm");
  console.log("storagePut ok:", uploaded.key);
  const signedUrl = await storageGetSignedUrl(uploaded.key);
  console.log("signedUrl ok:", signedUrl.slice(0, 40));
  const result = await transcribeAudio({ audioUrl: signedUrl, language: "en", prompt: "test" });
  console.log("transcribeAudio result:", JSON.stringify(result).slice(0, 300));
} catch (e) {
  console.log("transcribe chain error:", e instanceof Error ? e.message : e);
}
