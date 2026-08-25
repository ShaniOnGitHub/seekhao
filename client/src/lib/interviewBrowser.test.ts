import { describe, expect, it } from "vitest";
import { browserVoiceMessage, interviewRequestErrorMessage, microphoneErrorMessage, normaliseAudioMimeType, preferredEnglishVoice } from "./interviewBrowser";

describe("seekhao browser interview helpers", () => {
  it("normalises recorder codec strings and falls back safely", () => {
    expect(normaliseAudioMimeType("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(normaliseAudioMimeType("audio/mp4")).toBe("audio/mp4");
    expect(normaliseAudioMimeType("video/webm")).toBe("audio/webm");
  });

  it("gives an actionable response for expected microphone failures", () => {
    expect(microphoneErrorMessage({ name: "NotAllowedError" })).toContain("permission is blocked");
    expect(microphoneErrorMessage({ name: "NotFoundError" })).toContain("couldn’t find a microphone");
    expect(microphoneErrorMessage({ name: "NotReadableError" })).toContain("busy in another app");
  });

  it("keeps the subtitle fallback explicit when browser speech is unavailable", () => {
    expect(browserVoiceMessage()).toContain("subtitles");
    expect(browserVoiceMessage()).toContain("Chrome, Edge, or Firefox");
  });

  it("turns a gateway HTML parse error into a retryable request message", () => {
    expect(interviewRequestErrorMessage(new Error("Unexpected token '<', \"<html>\" is not valid JSON"), "fallback")).toContain("refresh this page");
    expect(interviewRequestErrorMessage(new Error("Unexpected token '<', \"<html>\" is not valid JSON"), "fallback")).not.toContain("upload");
    expect(interviewRequestErrorMessage(new Error("keep each answer recording under 16mb"), "fallback")).toBe("keep each answer recording under 16mb");
  });

  it("turns browser network failures into a clear retry message", () => {
    expect(interviewRequestErrorMessage(new TypeError("Failed to fetch"), "fallback")).toContain("check your connection");
  });

  it("prefers a recognised woman-coded English voice before a generic English fallback", () => {
    const voices = [
      { name: "Google US English", lang: "en-US" },
      { name: "Microsoft Aria Online", lang: "en-US" },
      { name: "Google Deutsch", lang: "de-DE" },
    ];
    expect(preferredEnglishVoice(voices)?.name).toBe("Microsoft Aria Online");
    expect(preferredEnglishVoice([{ name: "Google US English", lang: "en-US" }])?.name).toBe("Google US English");
  });
});
