export type AudioMimeType = "audio/webm" | "audio/mp4" | "audio/mpeg" | "audio/wav" | "audio/ogg";

const supportedAudioMimeTypes: AudioMimeType[] = ["audio/webm", "audio/mp4", "audio/mpeg", "audio/wav", "audio/ogg"];

export function normaliseAudioMimeType(value: string): AudioMimeType {
  const mimeType = value.split(";")[0]?.toLowerCase();
  return supportedAudioMimeTypes.includes(mimeType as AudioMimeType) ? (mimeType as AudioMimeType) : "audio/webm";
}

export function microphoneErrorMessage(error: unknown) {
  const name = typeof error === "object" && error && "name" in error ? String(error.name) : "";
  if (name === "NotAllowedError") return "microphone permission is blocked. allow it in your browser’s site controls, then try again. if you’re using an embedded preview, open seekhao in a regular browser tab after publishing.";
  if (name === "NotFoundError") return "we couldn’t find a microphone. connect one, then try again.";
  if (name === "NotReadableError") return "your microphone is busy in another app. close that app, then try again.";
  if (error instanceof Error) return error.message;
  return "we couldn’t start the microphone. try again.";
}

export function browserVoiceMessage() {
  return "spoken audio is unavailable in this browser preview, but the question remains fully usable as subtitles. after publishing, open seekhao in Chrome, Edge, or Firefox in a regular browser tab for microphone and spoken prompts.";
}

const womanVoiceHints = /\b(aria|ava|hazel|jenny|libby|linda|samantha|susan|zira)\b/i;

export function preferredEnglishVoice<T extends { lang: string; name: string }>(voices: T[]) {
  const english = voices.filter(voice => voice.lang.toLowerCase().startsWith("en"));
  return english.find(voice => womanVoiceHints.test(voice.name)) ?? english[0];
}

export function interviewRequestErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  if (/unexpected token.*<|not valid json/i.test(message)) return "that upload was interrupted before it reached seekhao. refresh this page once, then try again.";
  return message || fallback;
}
