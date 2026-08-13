import { describe, expect, it } from "vitest";
import { browserVoiceMessage, microphoneErrorMessage, normaliseAudioMimeType } from "./interviewBrowser";

describe("seekho browser interview helpers", () => {
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
});
