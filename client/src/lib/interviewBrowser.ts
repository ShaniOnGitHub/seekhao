export type AudioMimeType = "audio/webm" | "audio/mp4" | "audio/mpeg" | "audio/wav" | "audio/ogg";

const supportedAudioMimeTypes: AudioMimeType[] = ["audio/webm", "audio/mp4", "audio/mpeg", "audio/wav", "audio/ogg"];

export function normaliseAudioMimeType(value: string): AudioMimeType {
  const mimeType = value.split(";")[0]?.toLowerCase();
  return supportedAudioMimeTypes.includes(mimeType as AudioMimeType) ? (mimeType as AudioMimeType) : "audio/webm";
}

export function microphoneErrorMessage(error: unknown) {
  const name = typeof error === "object" && error && "name" in error ? String(error.name) : "";
  if (name === "NotAllowedError") return "microphone permission is blocked. allow it in your browser’s site controls, then try again. if you’re using an embedded preview, open seekho in a regular browser tab after publishing.";
  if (name === "NotFoundError") return "we couldn’t find a microphone. connect one, then try again.";
  if (name === "NotReadableError") return "your microphone is busy in another app. close that app, then try again.";
  if (error instanceof Error) return error.message;
  return "we couldn’t start the microphone. try again.";
}

export function browserVoiceMessage() {
  return "spoken audio is unavailable in this browser preview, but the question remains fully usable as subtitles. after publishing, open seekho in Chrome, Edge, or Firefox in a regular browser tab for microphone and spoken prompts.";
}
