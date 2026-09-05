import { ENV } from "./_core/env";
import { invokeLLM } from "./_core/llm";

const GROQ_TEXT_MODEL = process.env.GROQ_TEXT_MODEL || "qwen/qwen3.6-27b";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "google/gemini-3.7-flash";
const OPENROUTER_FALLBACK_MODEL = process.env.OPENROUTER_FALLBACK_MODEL || "google/gemini-2.5-flash";

async function invokeOpenRouterChat(request: Parameters<typeof invokeLLM>[0]): Promise<Awaited<ReturnType<typeof invokeLLM>>> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");
  
  let format = request.response_format?.type === "json_schema"
    ? { type: "json_object" as const }
    : request.response_format ?? { type: "json_object" as const };
    
  const payload = { 
    model: OPENROUTER_MODEL, 
    messages: request.messages, 
    max_tokens: request.max_tokens, 
    response_format: format 
  };
  
  let response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    const status = response.status;
    if (status === 400 && errorText.includes("json_validate_failed")) {
      console.warn("[seekhao] OpenRouter json_validate_failed, retrying on fallback model");
      payload.model = OPENROUTER_FALLBACK_MODEL;
      format = { type: "json_object" as const };
      payload.response_format = format;
      response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.ok) return (await response.json()) as Awaited<ReturnType<typeof invokeLLM>>;
    }
    const retryText = await response.text().catch(() => "");
    throw new Error(`OpenRouter chat request failed: ${status} ${response.statusText} – ${retryText}`);
  }
  return (await response.json()) as Awaited<ReturnType<typeof invokeLLM>>;
}

async function invokeGroqChat(request: Parameters<typeof invokeLLM>[0]): Promise<Awaited<ReturnType<typeof invokeLLM>>> {
  const apiKey = ENV.groqApiKey;
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured");
  
  const format = request.response_format?.type === "json_schema"
    ? { type: "json_object" as const }
    : request.response_format ?? { type: "json_object" as const };
    
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ 
      model: GROQ_TEXT_MODEL, 
      messages: request.messages, 
      max_tokens: request.max_tokens, 
      response_format: format 
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Groq chat request failed: ${response.status} ${response.statusText} – ${errorText}`);
  }
  return (await response.json()) as Awaited<ReturnType<typeof invokeLLM>>;
}

export async function invokeInterviewModel(request: Parameters<typeof invokeLLM>[0]) {
  const platformConfigured = Boolean(ENV.forgeApiUrl && ENV.forgeApiKey);
  
  if (process.env.OPENROUTER_API_KEY) {
    try {
      return await invokeOpenRouterChat(request);
    } catch (error) {
      if (!platformConfigured && !(ENV.groqApiKey || process.env.GROQ_API_KEY)) {
        const message = error instanceof Error ? error.message : "unknown error";
        throw new Error(`question generation failed (${message.replace(/^OpenRouter chat request failed: /, "")})`);
      }
    }
  }
  
  if (ENV.groqApiKey || process.env.GROQ_API_KEY) {
    try {
      return await invokeGroqChat(request);
    } catch (error) {
      if (!platformConfigured) {
        const message = error instanceof Error ? error.message : "unknown error";
        throw new Error(`question generation failed (${message.replace(/^Groq chat request failed: /, "")})`);
      }
      return await invokeLLM(request);
    }
  }
  
  return await invokeLLM(request);
}
