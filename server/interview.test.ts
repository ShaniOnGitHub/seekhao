import { describe, expect, it } from "vitest";
import { isRoundComplete, normaliseScore, parseJson, questionNumberFor, roleFocus } from "./interview";

describe("seekho interview helpers", () => {
  it("prioritises the requested AI-engineering concepts", () => {
    const focus = roleFocus("AI engineer");
    expect(focus).toContain("rag");
    expect(focus).toContain("llm");
    expect(focus).toContain("langchain");
    expect(focus).toContain("multimodal");
    expect(focus).toContain("mcp");
  });

  it("keeps other role guidance specific without leaking AI-engineering topics", () => {
    expect(roleFocus("product manager")).toContain("prioritisation");
    expect(roleFocus("data analyst")).toContain("experimentation");
  });

  it("uses a safe fallback when an AI response is malformed", () => {
    expect(parseJson("not json", { question: "fallback" })).toEqual({ question: "fallback" });
    expect(parseJson('{"question":"specific question"}', { question: "fallback" })).toEqual({ question: "specific question" });
  });

  it("limits feedback scores to the intended five-point range", () => {
    expect(normaliseScore(9)).toBe(5);
    expect(normaliseScore(-2)).toBe(1);
    expect(normaliseScore("3.4")).toBe(3);
    expect(normaliseScore("unknown")).toBe(3);
  });

  it("moves through exactly five questions before completing a round", () => {
    expect(questionNumberFor(0)).toBe(1);
    expect(questionNumberFor(4)).toBe(5);
    expect(isRoundComplete(4)).toBe(false);
    expect(isRoundComplete(5)).toBe(true);
    expect(questionNumberFor(99)).toBe(5);
  });
});
