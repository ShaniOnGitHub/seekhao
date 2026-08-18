// Curated, randomized question bank so repeated practice sessions never feel
// repetitive. Each role maps to topic pools; a question is drawn from a
// randomly chosen pool, sampled without replacement per session, and further
// deduplicated against questions asked in earlier sessions (in-memory for the
// running instance, sufficient for a single-server Render deployment).
//
// The bank feeds the AI coach: the sampled topic + framing seed is passed to
// the model so questions stay varied across the 10-20 sessions a user may do.
// A hard-coded fallback pool guarantees a sane question even when the AI
// service is unavailable.

import { difficultyForQuestion } from "./interview";

export type QuestionSeed = {
  topic: string;
  framing: string;
  why: string;
};

type Pool = { name: string; seeds: QuestionSeed[] };

// Role detection mirrors roleFocus() in interview.ts — keep the two in sync.
function aiRole(role: string) {
  const n = role.toLowerCase();
  return n.includes("ai") || n.includes("machine learning") || n.includes("ml");
}
function productRole(role: string) {
  return role.toLowerCase().includes("product");
}
function dataRole(role: string) {
  const n = role.toLowerCase();
  return n.includes("data") || n.includes("analyst");
}
function designRole(role: string) {
  return role.toLowerCase().includes("design");
}

const PERSISTENCE_FRAMINGS = [
  "walk me through",
  "tell me about",
  "when have you",
  "how would you",
  "what would you compare or choose between",
  "explain a time you decided",
];

const AI_ENGINEERING_POOLS: Pool[] = [
  {
    name: "retrieval and rag",
    seeds: [
      { topic: "rag pipeline", framing: "walk me through", why: "tests applied system knowledge" },
      { topic: "chunking and embedding choices", framing: "what would you compare or choose between", why: "tests design trade-offs" },
      { topic: "hallucination and grounding failures in rag", framing: "how would you catch", why: "tests production judgement" },
      { topic: "vector database selection", framing: "when have you picked", why: "tests real decision experience" },
      { topic: "evaluating rag quality", framing: "tell me about how you would measure", why: "tests metrics thinking" },
    ],
  },
  {
    name: "llm and prompting",
    seeds: [
      { topic: "prompt iteration", framing: "tell me about", why: "tests iteration discipline" },
      { topic: "structured output and schema enforcement", framing: "how would you get", why: "tests practical llm engineering" },
      { topic: "context window limits", framing: "what would you do when", why: "tests constraint handling" },
      { topic: "fine-tuning versus prompting", framing: "explain a time you decided", why: "tests cost-quality judgement" },
      { topic: "model selection for a product", framing: "how would you choose", why: "tests vendor trade-offs" },
      { topic: "cost and latency optimisation", framing: "walk me through", why: "tests production realism" },
    ],
  },
  {
    name: "agents and orchestration",
    seeds: [
      { topic: "agent loop design", framing: "walk me through", why: "tests orchestration depth" },
      { topic: "tool calling and mcp", framing: "how would you design", why: "tests integration choices" },
      { topic: "langchain or orchestration frameworks", framing: "tell me about", why: "tests framework judgement" },
      { topic: "agent failure handling", framing: "what would you do when", why: "tests reliability thinking" },
      { topic: "memory and state across turns", framing: "explain a time you decided", why: "tests state design" },
    ],
  },
  {
    name: "multimodal and safety",
    seeds: [
      { topic: "multimodal inputs (vision, audio)", framing: "tell me about", why: "tests modality breadth" },
      { topic: "content safety and guardrails", framing: "how would you build", why: "tests safety awareness" },
      { topic: "evaluation of multimodal models", framing: "how would you measure", why: "tests eval discipline" },
      { topic: "pii and data governance with llms", framing: "what would you consider", why: "tests governance thinking" },
    ],
  },
  {
    name: "delivery and production",
    seeds: [
      { topic: "shipping an ai feature under ambiguity", framing: "when have you", why: "tests delivery experience" },
      { topic: "observability and monitoring of llm systems", framing: "walk me through", why: "tests production habits" },
      { topic: "a technical disagreement with a teammate", framing: "tell me about", why: "tests collaboration" },
      { topic: "a system you would redesign today", framing: "explain a time you decided", why: "tests hindsight and growth" },
      { topic: "stakeholder expectations for ai accuracy", framing: "how would you set", why: "tests communication" },
    ],
  },
];

const PRODUCT_POOLS: Pool[] = [
  {
    name: "strategy and prioritisation",
    seeds: [
      { topic: "prioritising conflicting roadmap requests", framing: "how would you decide", why: "tests prioritisation" },
      { topic: "strategy for a new product line", framing: "walk me through", why: "tests strategic framing" },
      { topic: "killing a feature", framing: "tell me about", why: "tests conviction" },
      { topic: "north star metrics", framing: "what would you choose", why: "tests metric discipline" },
    ],
  },
  {
    name: "user insight and discovery",
    seeds: [
      { topic: "user research into a launch decision", framing: "when have you", why: "tests evidence use" },
      { topic: "surprising user feedback", framing: "tell me about", why: "tests listening" },
      { topic: "segmenting users for a decision", framing: "how would you approach", why: "tests segmentation" },
    ],
  },
  {
    name: "execution and stakeholders",
    seeds: [
      { topic: "launch that missed its goal", framing: "tell me about", why: "tests accountability" },
      { topic: "managing stakeholder disagreement", framing: "walk me through", why: "tests influence" },
      { topic: "engineering trade-off pushed by product", framing: "how would you negotiate", why: "tests collaboration" },
      { topic: "running an experiment to conclusion", framing: "explain a time you decided", why: "tests experimentation" },
    ],
  },
];

const DATA_POOLS: Pool[] = [
  {
    name: "modelling and quality",
    seeds: [
      { topic: "data model for an ambiguous requirement", framing: "walk me through", why: "tests modelling" },
      { topic: "dirty or missing data", framing: "how would you handle", why: "tests pragmatism" },
      { topic: "schema change at scale", framing: "tell me about", why: "tests migration discipline" },
    ],
  },
  {
    name: "analysis and experimentation",
    seeds: [
      { topic: "designing an a/b experiment", framing: "walk me through", why: "tests experimentation" },
      { topic: "insight that changed a decision", framing: "when have you", why: "tests impact" },
      { topic: "metric that misled the team", framing: "tell me about", why: "tests scepticism" },
      { topic: "choosing analysis tools", framing: "what would you compare or choose between", why: "tests tooling judgement" },
    ],
  },
  {
    name: "communication and impact",
    seeds: [
      { topic: "presenting analysis to non-technical leadership", framing: "how would you frame", why: "tests communication" },
      { topic: "dashboard nobody used", framing: "tell me about", why: "tests outcome focus" },
      { topic: "analytics reliability incident", framing: "walk me through", why: "tests incident handling" },
    ],
  },
];

const DESIGN_POOLS: Pool[] = [
  {
    name: "research and decisions",
    seeds: [
      { topic: "research informing a redesign", framing: "when have you", why: "tests evidence use" },
      { topic: "conflicting usability findings", framing: "how would you resolve", why: "tests judgement" },
      { topic: "interaction detail that mattered", framing: "walk me through", why: "tests craft" },
    ],
  },
  {
    name: "collaboration and critique",
    seeds: [
      { topic: "design critique you received well", framing: "tell me about", why: "tests openness" },
      { topic: "pushing back on engineering constraints", framing: "explain a time you decided", why: "tests advocacy" },
      { topic: "portfolio piece selection", framing: "what would you compare or choose between", why: "tests curation" },
    ],
  },
  {
    name: "systems thinking",
    seeds: [
      { topic: "design system adoption", framing: "walk me through", why: "tests systems thinking" },
      { topic: "accessibility decision", framing: "how would you approach", why: "tests inclusion" },
    ],
  },
];

const GENERAL_POOLS: Pool[] = [
  {
    name: "delivery and judgement",
    seeds: [
      { topic: "a decision you made with incomplete information", framing: "walk me through", why: "tests judgement" },
      { topic: "a project that failed or stalled", framing: "tell me about", why: "tests accountability" },
      { topic: "deadline versus quality trade-off", framing: "what would you compare or choose between", why: "tests trade-offs" },
      { topic: "learning a technology quickly", framing: "when have you", why: "tests learning" },
      { topic: "communication breakdown on a project", framing: "explain a time you decided", why: "tests collaboration" },
    ],
  },
  {
    name: "motivation and growth",
    seeds: [
      { topic: "work you would repeat", framing: "tell me about", why: "tests motivation" },
      { topic: "feedback you acted on", framing: "when have you", why: "tests growth" },
      { topic: "role choice rationale", framing: "how would you explain", why: "tests self-awareness" },
    ],
  },
];

function poolsForRole(role: string): Pool[] {
  if (aiRole(role)) return AI_ENGINEERING_POOLS;
  if (productRole(role)) return PRODUCT_POOLS;
  if (dataRole(role)) return DATA_POOLS;
  if (designRole(role)) return DESIGN_POOLS;
  return [...GENERAL_POOLS, ...(aiRole(role) ? [] : [])];
}

// Per-instance memory of questions already used across sessions, so the same
// user does not see identical questions in back-to-back practice rounds.
const usedTopicKeys = new Set<string>();
const MAX_USED_HISTORY = 600;

function topicKey(role: string, seed: QuestionSeed) {
  return `${role.toLowerCase().trim()}|${seed.topic}|${seed.framing}`;
}

export function drawQuestionSeed(role: string, usedInSession: string[] = []): QuestionSeed {
  const pools = poolsForRole(role);
  const difficulty = difficultyForQuestion(usedInSession.length);
  // Prefer pools not yet touched this session; fall back to all pools.
  const touchedPools = new Set(
    pools
      .flatMap(pool => pool.seeds)
      .filter(seed => usedInSession.some(used => used.toLowerCase().includes(seed.topic.toLowerCase())))
      .map(seed => pools.find(pool => pool.seeds.includes(seed))!)
      .filter(Boolean),
  );
  const candidatePools = pools.filter(pool => !touchedPools.has(pool));
  const pool = candidatePools[Math.floor(Math.random() * candidatePools.length)] || pools[Math.floor(Math.random() * pools.length)];
  // Prefer seeds unused across sessions; otherwise use a random seed.
  const freshSeeds = pool.seeds.filter(seed => !usedTopicKeys.has(topicKey(role, seed)));
  const seed = freshSeeds.length
    ? freshSeeds[Math.floor(Math.random() * freshSeeds.length)]
    : pool.seeds[Math.floor(Math.random() * pool.seeds.length)];
  usedTopicKeys.add(topicKey(role, seed));
  if (usedTopicKeys.size > MAX_USED_HISTORY) {
    const overflow = usedTopicKeys.size - MAX_USED_HISTORY;
    const keys = Array.from(usedTopicKeys);
    for (let i = 0; i < overflow; i += 1) usedTopicKeys.delete(keys[i]);
  }
  // Vary the framing randomly even for the same seed across sessions.
  const framingVariants = PERSISTENCE_FRAMINGS.filter(variant => variant !== seed.framing);
  const framing = Math.random() < 0.6 ? seed.framing : framingVariants[Math.floor(Math.random() * framingVariants.length)];
  void difficulty; // difficulty is guidance for the model, not the seed
  return { ...seed, framing };
}

// Deterministic hard-coded fallback for when the AI service cannot respond.
const HARDCODED_FALLBACKS: QuestionSeed[] = [
  { topic: "a real decision you made", framing: "walk me through", why: "universal" },
  { topic: "something you learned recently", framing: "tell me about", why: "universal" },
  { topic: "a trade-off you would make in this role", framing: "what would you compare or choose between", why: "universal" },
];

export function fallbackSeedForRole(role: string): QuestionSeed {
  void role;
  return HARDCODED_FALLBACKS[Math.floor(Math.random() * HARDCODED_FALLBACKS.length)];
}

export function formatSeedAsPromptBase(seed: QuestionSeed, role: string): string {
  return `topic: ${seed.topic}\nframing style: ${seed.framing}\nwhy this topic: ${seed.why}`;
}
