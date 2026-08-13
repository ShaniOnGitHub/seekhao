import { invokeLLM } from "../server/_core/llm.ts";

const response = await invokeLLM({
  model: "gemini-3-flash-preview",
  max_tokens: 1536,
  response_format: { type: "json_schema", json_schema: { name: "answer_feedback", strict: true, schema: { type: "object", properties: { score: { type: "number" }, feedback: { type: "string" }, strength: { type: "string" }, focus: { type: "string" }, nextCue: { type: "string" } }, required: ["score", "feedback", "strength", "focus", "nextCue"], additionalProperties: false } } },
  messages: [
    { role: "system", content: "You are a precise, kind interview coach. Return JSON only. Judge the candidate answer for relevance, clarity, technical accuracy, and depth. Keep every value lowercase and conversational. Never invent details the candidate did not say." },
    { role: "user", content: "role: AI engineer\nfocus: rag, llm systems, prompt design, evaluation, langchain or orchestration, multimodal systems, mcp, safety, and production trade-offs\nquestion: In a RAG pipeline, why might you choose hybrid search?\nanswer transcript: For a production RAG system, I would begin with hybrid retrieval and evaluate answer faithfulness, recall, latency, and cost on a representative evaluation set.\n\nReturn exactly: {\"score\":1,\"feedback\":\"one short sentence\",\"strength\":\"one short phrase\",\"focus\":\"one short phrase\",\"nextCue\":\"one short sentence\"}" },
  ],
});

console.log(JSON.stringify(response, null, 2));
