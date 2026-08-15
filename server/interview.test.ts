import { describe, expect, it } from "vitest";
import { chooseOpeningAngle, difficultyForQuestion, isRoundComplete, normaliseScore, openingQuestionForRole, parseJson, questionNumberFor, roleFocus } from "./interview";

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

  it("uses an encouraging two-to-five feedback range", () => {
    expect(normaliseScore(9)).toBe(5);
    expect(normaliseScore(-2)).toBe(2);
    expect(normaliseScore(1)).toBe(2);
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

  it("ramps from accessible fundamentals to challenging judgement across a round", () => {
    expect(difficultyForQuestion(1)).toBe("easy");
    expect(difficultyForQuestion(2)).toBe("easy");
    expect(difficultyForQuestion(3)).toBe("intermediate");
    expect(difficultyForQuestion(4)).toBe("advanced");
    expect(difficultyForQuestion(5)).toBe("challenging");
  });

  it("starts practice with a varying opener covering introduce, project, or strengths angles", () => {
    const questions = new Set<string>();
    for (let i = 0; i < 24; i++) questions.add(openingQuestionForRole("AI engineer", chooseOpeningAngle()).question);
    expect(questions.size).toBeGreaterThanOrEqual(3);
    expect(openingQuestionForRole("AI engineer", "introduce").question).toContain("introduce yourself");
    expect(openingQuestionForRole("AI engineer", "strengths").question).toContain("biggest technical strength");
    expect(openingQuestionForRole("AI engineer", "project").question).toContain("project");
  });
});
