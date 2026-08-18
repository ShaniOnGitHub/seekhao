import { describe, expect, it } from "vitest";
import { drawQuestionSeed, fallbackSeedForRole } from "./questionBank";

describe("seekhao question bank", () => {
  it("never repeats a topic within a single session", () => {
    const questions: string[] = [];
    const topics = new Set<string>();
    for (let i = 0; i < 12; i += 1) {
      const seed = drawQuestionSeed("AI engineer", questions);
      questions.push(`a question about ${seed.topic}`);
      topics.add(seed.topic);
    }
    expect(topics.size).toBe(12);
  });

  it("routes roles to their own topic pools", () => {
    const ai = drawQuestionSeed("AI engineer");
    expect(["rag pipeline", "chunking and embedding choices", "hallucination and grounding failures in rag", "vector database selection", "evaluating rag quality", "prompt iteration", "structured output and schema enforcement", "context window limits", "fine-tuning versus prompting", "model selection for a product", "cost and latency optimisation", "agent loop design", "tool calling and mcp", "langchain or orchestration frameworks", "agent failure handling", "memory and state across turns", "multimodal inputs (vision, audio)", "content safety and guardrails", "evaluation of multimodal models", "pii and data governance with llms", "shipping an ai feature under ambiguity", "observability and monitoring of llm systems", "a technical disagreement with a teammate", "a system you would redesign today", "stakeholder expectations for ai accuracy"]).toContain(ai.topic);

    const product = drawQuestionSeed("product manager");
    expect(product.topic).not.toContain("rag");
    const data = drawQuestionSeed("data analyst");
    expect(["data model for an ambiguous requirement", "dirty or missing data", "schema change at scale", "designing an a/b experiment", "insight that changed a decision", "metric that misled the team", "choosing analysis tools", "presenting analysis to non-technical leadership", "dashboard nobody used", "analytics reliability incident"].map(String)).toEqual(expect.arrayContaining([data.topic]));
    const design = drawQuestionSeed("ux designer");
    expect(["research informing a redesign", "conflicting usability findings", "interaction detail that mattered", "design critique you received well", "pushing back on engineering constraints", "portfolio piece selection", "design system adoption", "accessibility decision"].map(String)).toEqual(expect.arrayContaining([design.topic]));
    const unknown = drawQuestionSeed("plumber");
    expect(unknown.topic).not.toBeUndefined();
  });

  it("falls back to a sensible universal seed when the AI service is unavailable", () => {
    const seed = fallbackSeedForRole("ai engineer");
    expect(seed.topic.length).toBeGreaterThan(3);
    expect(seed.framing.length).toBeGreaterThan(3);
    expect(seed.why).toBe("universal");
  });

  it("varies framing styles so back-to-back sessions do not sound identical", () => {
    const framings = new Set<string>();
    const used: string[] = [];
    for (let i = 0; i < 30; i += 1) {
      const seed = drawQuestionSeed("data analyst", used);
      used.push(`a question about ${seed.topic}`);
      framings.add(seed.framing);
      if (framings.size >= 4) break;
    }
    expect(framings.size).toBeGreaterThanOrEqual(4);
  });
});
