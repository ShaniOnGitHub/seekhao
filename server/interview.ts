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

export type OpeningAngle = "introduce" | "project" | "strengths";

export function chooseOpeningAngle(): OpeningAngle {
  const roll = Math.random();
  if (roll < 0.4) return "introduce";
  if (roll < 0.75) return "project";
  return "strengths";
}

export function openingQuestionForRole(role: string, angle: OpeningAngle = chooseOpeningAngle()) {
  const normalized = role.toLowerCase();
  const isTechnical = normalized.includes("ai") || normalized.includes("machine learning") || normalized.includes("ml") || normalized.includes("software") || normalized.includes("data") || normalized.includes("analyst");
  const domain = isTechnical ? "tech, data, or automation work" : "work you have done";
  if (angle === "introduce") return { question: `hi there, let's start simple: introduce yourself. what do you do, and what kind of ${domain} excites you right now?`, focus: "candidate background and motivation" };
  if (angle === "strengths") return { question: `to begin, what do you consider your biggest technical strength as a candidate for this ${role} role, and where have you proven it?`, focus: "self-awareness and evidence" };
  return { question: `to begin, tell me about a project you enjoyed working on in ${domain}. what problem were you trying to solve?`, focus: "project context and motivation" };
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
  return Math.min(5, Math.max(2, Math.round(parsed)));
}

export function parseJson<T>(content: string | null | undefined, fallback: T): T {
  if (!content) return fallback;
  try { return JSON.parse(content) as T; } catch { return fallback; }
}
