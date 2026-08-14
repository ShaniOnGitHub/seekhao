export const MAX_QUESTIONS = 5;

export function isRoundComplete(answerCount: number) {
  return answerCount >= MAX_QUESTIONS;
}

export function questionNumberFor(answerCount: number) {
  return Math.min(answerCount + 1, MAX_QUESTIONS);
}

export function difficultyForQuestion(questionNumber: number) {
  if (questionNumber <= 2) return "easy";
  if (questionNumber === 3) return "intermediate";
  if (questionNumber === 4) return "advanced";
  return "challenging";
}

export function openingQuestionForRole(role: string) {
  const normalized = role.toLowerCase();
  if (normalized.includes("ai") || normalized.includes("machine learning") || normalized.includes("ml")) return { question: "to begin, tell me about an ai, data, or automation project you have worked on. what problem were you trying to solve?", focus: "project context and motivation" };
  if (normalized.includes("software")) return { question: "to begin, tell me about a software project you enjoyed building. what did it do, and why did it matter?", focus: "project context and motivation" };
  if (normalized.includes("data") || normalized.includes("analyst")) return { question: "to begin, tell me about an analysis you are proud of. what question were you trying to answer?", focus: "problem framing and insight" };
  if (normalized.includes("product manager")) return { question: "to begin, tell me about a product problem you helped solve. what made it worth working on?", focus: "problem framing and user value" };
  if (normalized.includes("design")) return { question: "to begin, tell me about a design problem you enjoyed working on. who was it for, and what were you trying to improve?", focus: "user problem and design intent" };
  return { question: "to begin, tell me about a project or problem you enjoyed working on. what made it meaningful to you?", focus: "project context and motivation" };
}

export type Feedback = {
  score: number;
  feedback: string;
  strength: string;
  focus: string;
  nextCue: string;
};

export type Answer = {
  question: string;
  transcript: string;
  feedback: Feedback;
};

export type InterviewSession = {
  id: string;
  name: string;
  role: string;
  resumeSummary: string;
  questions: string[];
  answers: Answer[];
  createdAt: number;
};

export function roleFocus(role: string) {
  const normalized = role.toLowerCase();
  if (normalized.includes("ai") || normalized.includes("machine learning") || normalized.includes("ml")) {
    return "rag, llm systems, prompt design, evaluation, langchain or orchestration, multimodal systems, mcp, safety, and production trade-offs";
  }
  if (normalized.includes("product")) return "product strategy, prioritisation, user insight, metrics, trade-offs, execution, and stakeholder influence";
  if (normalized.includes("data") || normalized.includes("analyst")) return "data modelling, analytics methods, experimentation, insight quality, communication, and business impact";
  if (normalized.includes("design")) return "product thinking, research, interaction decisions, collaboration, critique, and portfolio decisions";
  return "technical foundations, decision-making, trade-offs, communication, and real-world delivery";
}

export function normaliseScore(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 3;
  return Math.min(5, Math.max(1, Math.round(parsed)));
}

export function parseJson<T>(content: string | null | undefined, fallback: T): T {
  if (!content) return fallback;
  try { return JSON.parse(content) as T; } catch { return fallback; }
}
