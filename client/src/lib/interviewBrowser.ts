export type AudioMimeType = "audio/webm" | "audio/mp4" | "audio/mpeg" | "audio/wav" | "audio/ogg";

const supportedAudioMimeTypes: AudioMimeType[] = ["audio/webm", "audio/mp4", "audio/mpeg", "audio/wav", "audio/ogg"];

/**
 * Normalises an audio MIME type string to one of the supported types.
 * @param value The raw MIME type string from the browser.
 * @returns A supported AudioMimeType, defaulting to 'audio/webm'.
 */
export function normaliseAudioMimeType(value: string): AudioMimeType {
  const mimeType = value.split(";")[0]?.toLowerCase();
  return supportedAudioMimeTypes.includes(mimeType as AudioMimeType) ? (mimeType as AudioMimeType) : "audio/webm";
}

/**
 * Maps common MediaDevices.getUserMedia errors to user-friendly messages.
 * @param error The error object caught from the microphone request.
 * @returns A helpful error message string.
 */
export function microphoneErrorMessage(error: unknown) {
  const name = typeof error === "object" && error && "name" in error ? String(error.name) : "";
  if (name === "NotAllowedError") return "microphone permission is blocked. allow it in your browser’s site controls, then try again. if you’re using an embedded preview, open seekhao in a regular browser tab after publishing.";
  if (name === "NotFoundError") return "we couldn’t find a microphone. connect one, then try again.";
  if (name === "NotReadableError") return "your microphone is busy in another app. close that app, then try again.";
  if (error instanceof Error) return error.message;
  return "we couldn’t start the microphone. try again.";
}

/**
 * Returns a fallback message when spoken audio is unavailable in the current environment.
 */
export function browserVoiceMessage() {
  return "spoken audio is unavailable in this browser preview, but the question remains fully usable as subtitles. after publishing, open seekhao in Chrome, Edge, or Firefox in a regular browser tab for microphone and spoken prompts.";
}

const womanVoiceHints = /\b(aria|ava|hazel|jenny|libby|linda|samantha|susan|zira)\b/i;

/**
 * Selects a preferred English voice from the available SpeechSynthesis voices.
 * Prioritizes natural-sounding female voices based on common name hints.
 * @param voices The list of available SpeechSynthesisVoice objects.
 * @returns The preferred voice or the first available English voice.
 */
export function preferredEnglishVoice<T extends { lang: string; name: string }>(voices: T[]) {
  const english = voices.filter(voice => voice.lang.toLowerCase().startsWith("en"));
  return english.find(voice => womanVoiceHints.test(voice.name)) ?? english[0];
}

// When the browser receives an HTML error page (gateway/proxy 502/503/413 etc.) instead of
// JSON, the fetch parser surfaces it as "Unexpected token <..." or "not valid json". That means
// the request never reached the api router — surface an accurate network-failure message so the
// wording stays truthful no matter which mutation failed (start practice, answer, or resume).
/**
 * Formats API request errors into human-readable messages, specifically handling
 * network interruptions and non-JSON responses (like 502/503 HTML errors).
 * @param error The error object from the fetch/tRPC request.
 * @param fallback The fallback message to use if no specific pattern is matched.
 * @returns A user-friendly error message.
 */
export function interviewRequestErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  if (/unexpected token.*<|not valid json/i.test(message)) return "the request was interrupted before it reached seekhao — usually a brief network or server hiccup. refresh this page once, then try again.";
  if (/failed to fetch|networkerror|load failed|network request failed|network connection/i.test(message)) return "we couldn't reach seekhao — check your connection, then try again.";
  return message || fallback;
}
