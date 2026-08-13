import { describe, expect, it } from "vitest";
import { normaliseResumeText } from "./resumeText";

describe("normaliseResumeText", () => {
  it("compacts whitespace before sending bounded resume context to the server", () => {
    expect(normaliseResumeText("  AI engineer\n\n  RAG  \t evaluation  ")).toBe("AI engineer RAG evaluation");
  });

  it("caps extracted resume text to the safe interview-start payload size", () => {
    expect(normaliseResumeText("a".repeat(14_100))).toHaveLength(14_000);
  });
});
