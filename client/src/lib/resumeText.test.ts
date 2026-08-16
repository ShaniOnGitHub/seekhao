import { describe, expect, it } from "vitest";
import { detectResumeType, normaliseResumeText } from "./resumeText";

describe("detectResumeType", () => {
  it("accepts a pdf when the browser reports the correct mime type", () => {
    expect(detectResumeType(new File(["%PDF"], "resume.pdf", { type: "application/pdf" }))).toBe("pdf");
  });

  it("accepts a pdf when windows reports it as octet-stream", () => {
    expect(detectResumeType(new File(["%PDF"], "resume.pdf", { type: "application/octet-stream" }))).toBe("pdf");
  });

  it("accepts a pdf when the browser reports an empty mime type", () => {
    expect(detectResumeType(new File(["%PDF"], "resume.pdf", { type: "" }))).toBe("pdf");
  });

  it("accepts txt files by mime type and by extension", () => {
    expect(detectResumeType(new File(["plain"], "resume.txt", { type: "text/plain" }))).toBe("txt");
    expect(detectResumeType(new File(["plain"], "resume.txt", { type: "" }))).toBe("txt");
  });

  it("rejects anything that isn't a pdf or txt", () => {
    expect(detectResumeType(new File([""], "resume.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }))).toBeNull();
    expect(detectResumeType(new File([""], "photo.png", { type: "image/png" }))).toBeNull();
  });
});

describe("normaliseResumeText", () => {
  it("compacts whitespace before sending bounded resume context to the server", () => {
    expect(normaliseResumeText("  AI engineer\n\n  RAG  \t evaluation  ")).toBe("AI engineer RAG evaluation");
  });

  it("caps extracted resume text to the safe interview-start payload size", () => {
    expect(normaliseResumeText("a".repeat(14_100))).toHaveLength(14_000);
  });
});
