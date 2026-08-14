// api/trpc.ts
import "dotenv/config";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
var decodeOAuthState = (state) => {
  let decoded;
  try {
    decoded = atob(state);
  } catch {
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
  }
  return { redirectUri: decoded };
};

// server/routers.ts
import { TRPCError as TRPCError3 } from "@trpc/server";
import { nanoid } from "nanoid";
import { z as z2 } from "zod";

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
};

// server/_core/llm.ts
var ensureArray = (value) => Array.isArray(value) ? value : [value];
var normalizeContentPart = (part) => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }
  if (part.type === "text") {
    return part;
  }
  if (part.type === "image_url") {
    return part;
  }
  if (part.type === "file_url") {
    return part;
  }
  throw new Error("Unsupported message content part");
};
var normalizeMessage = (message) => {
  const { role, name, tool_call_id } = message;
  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content).map((part) => typeof part === "string" ? part : JSON.stringify(part)).join("\n");
    return {
      role,
      name,
      tool_call_id,
      content
    };
  }
  const contentParts = ensureArray(message.content).map(normalizeContentPart);
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text
    };
  }
  return {
    role,
    name,
    content: contentParts
  };
};
var normalizeToolChoice = (toolChoice, tools) => {
  if (!toolChoice) return void 0;
  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }
  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }
    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }
    return {
      type: "function",
      function: { name: tools[0].function.name }
    };
  }
  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name }
    };
  }
  return toolChoice;
};
var resolveApiUrl = () => ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0 ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions` : "https://forge.manus.im/v1/chat/completions";
var assertApiKey = () => {
  if (!ENV.forgeApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
};
var normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema
}) => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (explicitFormat.type === "json_schema" && !explicitFormat.json_schema?.schema) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }
  const schema = outputSchema || output_schema;
  if (!schema) return void 0;
  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }
  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...typeof schema.strict === "boolean" ? { strict: schema.strict } : {}
    }
  };
};
var RETRY_MAX_RETRIES = 4;
var RETRY_BASE_DELAY_MS = 500;
var RETRY_MAX_DELAY_MS = 3e4;
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
var parseRetryAfter = (value) => {
  if (!value) return void 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1e3);
  const at = Date.parse(value);
  return Number.isNaN(at) ? void 0 : Math.max(0, at - Date.now());
};
var computeBackoffDelay = (attempt, retryAfterMs) => {
  const cap = Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS);
  const jittered = cap / 2 + Math.random() * (cap / 2);
  return Math.min(Math.max(jittered, retryAfterMs ?? 0), RETRY_MAX_DELAY_MS);
};
var fetchWithBackoff = async (url, init) => {
  let lastError;
  for (let attempt = 0; attempt <= RETRY_MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, init);
      if (response.ok || response.status === 412 || attempt === RETRY_MAX_RETRIES) {
        return response;
      }
      const retryAfterMs = parseRetryAfter(
        response.headers.get("retry-after")
      );
      try {
        await response.body?.cancel();
      } catch {
      }
      console.warn(
        `LLM request retry ${attempt + 1}/${RETRY_MAX_RETRIES} after status ${response.status}`
      );
      await sleep(computeBackoffDelay(attempt, retryAfterMs));
    } catch (error) {
      lastError = error;
      if (attempt === RETRY_MAX_RETRIES) throw error;
      console.warn(
        `LLM request retry ${attempt + 1}/${RETRY_MAX_RETRIES} after network error`
      );
      await sleep(computeBackoffDelay(attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("LLM request failed after exhausting retries");
};
async function invokeLLM(params) {
  assertApiKey();
  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
    model,
    thinking,
    reasoning,
    maxTokens,
    max_tokens
  } = params;
  const payload = {
    messages: messages.map(normalizeMessage)
  };
  if (model) {
    payload.model = model;
  }
  if (tools && tools.length > 0) {
    payload.tools = tools;
  }
  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }
  const resolvedMaxTokens = max_tokens ?? maxTokens;
  if (typeof resolvedMaxTokens === "number") {
    payload.max_tokens = resolvedMaxTokens;
  }
  if (thinking) {
    payload.thinking = thinking;
  }
  if (reasoning) {
    payload.reasoning = reasoning;
  }
  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema
  });
  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }
  const response = await fetchWithBackoff(resolveApiUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.forgeApiKey}`
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} \u2013 ${errorText}`
    );
  }
  return await response.json();
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/_core/voiceTranscription.ts
async function transcribeAudio(options) {
  try {
    if (!ENV.forgeApiUrl) {
      return {
        error: "Voice transcription service is not configured",
        code: "SERVICE_ERROR",
        details: "BUILT_IN_FORGE_API_URL is not set"
      };
    }
    if (!ENV.forgeApiKey) {
      return {
        error: "Voice transcription service authentication is missing",
        code: "SERVICE_ERROR",
        details: "BUILT_IN_FORGE_API_KEY is not set"
      };
    }
    let audioBuffer;
    let mimeType;
    try {
      const response2 = await fetch(options.audioUrl);
      if (!response2.ok) {
        return {
          error: "Failed to download audio file",
          code: "INVALID_FORMAT",
          details: `HTTP ${response2.status}: ${response2.statusText}`
        };
      }
      audioBuffer = Buffer.from(await response2.arrayBuffer());
      mimeType = response2.headers.get("content-type") || "audio/mpeg";
      const sizeMB = audioBuffer.length / (1024 * 1024);
      if (sizeMB > 16) {
        return {
          error: "Audio file exceeds maximum size limit",
          code: "FILE_TOO_LARGE",
          details: `File size is ${sizeMB.toFixed(2)}MB, maximum allowed is 16MB`
        };
      }
    } catch (error) {
      return {
        error: "Failed to fetch audio file",
        code: "SERVICE_ERROR",
        details: error instanceof Error ? error.message : "Unknown error"
      };
    }
    const formData = new FormData();
    const filename = `audio.${getFileExtension(mimeType)}`;
    const audioBlob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
    formData.append("file", audioBlob, filename);
    formData.append("model", "whisper-1");
    formData.append("response_format", "verbose_json");
    const prompt = options.prompt || (options.language ? `Transcribe the user's voice to text, the user's working language is ${getLanguageName(options.language)}` : "Transcribe the user's voice to text");
    formData.append("prompt", prompt);
    const baseUrl = ENV.forgeApiUrl.endsWith("/") ? ENV.forgeApiUrl : `${ENV.forgeApiUrl}/`;
    const fullUrl = new URL(
      "v1/audio/transcriptions",
      baseUrl
    ).toString();
    const response = await fetch(fullUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "Accept-Encoding": "identity"
      },
      body: formData
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return {
        error: "Transcription service request failed",
        code: "TRANSCRIPTION_FAILED",
        details: `${response.status} ${response.statusText}${errorText ? `: ${errorText}` : ""}`
      };
    }
    const whisperResponse = await response.json();
    if (!whisperResponse.text || typeof whisperResponse.text !== "string") {
      return {
        error: "Invalid transcription response",
        code: "SERVICE_ERROR",
        details: "Transcription service returned an invalid response format"
      };
    }
    return whisperResponse;
  } catch (error) {
    return {
      error: "Voice transcription failed",
      code: "SERVICE_ERROR",
      details: error instanceof Error ? error.message : "An unexpected error occurred"
    };
  }
}
function getFileExtension(mimeType) {
  const mimeToExt = {
    "audio/webm": "webm",
    "audio/mp3": "mp3",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/wave": "wav",
    "audio/ogg": "ogg",
    "audio/m4a": "m4a",
    "audio/mp4": "m4a"
  };
  return mimeToExt[mimeType] || "audio";
}
function getLanguageName(langCode) {
  const langMap = {
    "en": "English",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "it": "Italian",
    "pt": "Portuguese",
    "ru": "Russian",
    "ja": "Japanese",
    "ko": "Korean",
    "zh": "Chinese",
    "ar": "Arabic",
    "hi": "Hindi",
    "nl": "Dutch",
    "pl": "Polish",
    "tr": "Turkish",
    "sv": "Swedish",
    "da": "Danish",
    "no": "Norwegian",
    "fi": "Finnish"
  };
  return langMap[langCode] || langCode;
}

// server/interview.ts
var MAX_QUESTIONS = 5;
function isRoundComplete(answerCount) {
  return answerCount >= MAX_QUESTIONS;
}
function questionNumberFor(answerCount) {
  return Math.min(answerCount + 1, MAX_QUESTIONS);
}
function difficultyForQuestion(questionNumber) {
  if (questionNumber <= 2) return "easy";
  if (questionNumber === 3) return "intermediate";
  if (questionNumber === 4) return "advanced";
  return "challenging";
}
function openingQuestionForRole(role) {
  const normalized = role.toLowerCase();
  if (normalized.includes("ai") || normalized.includes("machine learning") || normalized.includes("ml")) return { question: "to begin, tell me about an ai, data, or automation project you have worked on. what problem were you trying to solve?", focus: "project context and motivation" };
  if (normalized.includes("software")) return { question: "to begin, tell me about a software project you enjoyed building. what did it do, and why did it matter?", focus: "project context and motivation" };
  if (normalized.includes("data") || normalized.includes("analyst")) return { question: "to begin, tell me about an analysis you are proud of. what question were you trying to answer?", focus: "problem framing and insight" };
  if (normalized.includes("product manager")) return { question: "to begin, tell me about a product problem you helped solve. what made it worth working on?", focus: "problem framing and user value" };
  if (normalized.includes("design")) return { question: "to begin, tell me about a design problem you enjoyed working on. who was it for, and what were you trying to improve?", focus: "user problem and design intent" };
  return { question: "to begin, tell me about a project or problem you enjoyed working on. what made it meaningful to you?", focus: "project context and motivation" };
}
function roleFocus(role) {
  const normalized = role.toLowerCase();
  if (normalized.includes("ai") || normalized.includes("machine learning") || normalized.includes("ml")) {
    return "rag, llm systems, prompt design, evaluation, langchain or orchestration, multimodal systems, mcp, safety, and production trade-offs";
  }
  if (normalized.includes("product")) return "product strategy, prioritisation, user insight, metrics, trade-offs, execution, and stakeholder influence";
  if (normalized.includes("data") || normalized.includes("analyst")) return "data modelling, analytics methods, experimentation, insight quality, communication, and business impact";
  if (normalized.includes("design")) return "product thinking, research, interaction decisions, collaboration, critique, and portfolio decisions";
  return "technical foundations, decision-making, trade-offs, communication, and real-world delivery";
}
function normaliseScore(value) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 3;
  return Math.min(5, Math.max(2, Math.round(parsed)));
}
function parseJson(content, fallback) {
  if (!content) return fallback;
  try {
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}

// server/storage.ts
function getForgeConfig() {
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;
  if (!forgeUrl || !forgeKey) {
    throw new Error(
      "Storage config missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY"
    );
  }
  return { forgeUrl: forgeUrl.replace(/\/+$/, ""), forgeKey };
}
function normalizeKey(relKey) {
  return relKey.replace(/^\/+/, "");
}
function appendHashSuffix(relKey) {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}
async function storagePut(relKey, data, contentType = "application/octet-stream") {
  const { forgeUrl, forgeKey } = getForgeConfig();
  const key = appendHashSuffix(normalizeKey(relKey));
  const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
  presignUrl.searchParams.set("path", key);
  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` }
  });
  if (!presignResp.ok) {
    const msg = await presignResp.text().catch(() => presignResp.statusText);
    throw new Error(`Storage presign failed (${presignResp.status}): ${msg}`);
  }
  const { url: s3Url } = await presignResp.json();
  if (!s3Url) throw new Error("Forge returned empty presign URL");
  const blob = typeof data === "string" ? new Blob([data], { type: contentType }) : new Blob([data], { type: contentType });
  const uploadResp = await fetch(s3Url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob
  });
  if (!uploadResp.ok) {
    throw new Error(`Storage upload to S3 failed (${uploadResp.status})`);
  }
  return { key, url: `/manus-storage/${key}` };
}
async function storageGetSignedUrl(relKey) {
  const { forgeUrl, forgeKey } = getForgeConfig();
  const key = normalizeKey(relKey);
  const getUrl = new URL("v1/storage/presign/get", forgeUrl + "/");
  getUrl.searchParams.set("path", key);
  const resp = await fetch(getUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` }
  });
  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`Storage signed URL failed (${resp.status}): ${msg}`);
  }
  const { url } = await resp.json();
  return url;
}

// server/routers.ts
var sessions = /* @__PURE__ */ new Map();
var MAX_ANSWER_BYTES = 16 * 1024 * 1024;
var MAX_ANSWER_CHUNK_BASE64_CHARS = 6e4;
var ANSWER_UPLOAD_TTL_MS = 5 * 60 * 1e3;
var SEEKHO_TEXT_MODEL = "gemini-3-flash-preview";
var pendingAnswerUploads = /* @__PURE__ */ new Map();
var GROQ_TEXT_MODEL = "llama-3.3-70b-versatile";
async function invokeGroqChat(request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured");
  const format = request.response_format?.type === "json_schema" ? { type: "json_object" } : request.response_format ?? { type: "json_object" };
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: GROQ_TEXT_MODEL, messages: request.messages, max_tokens: request.max_tokens, response_format: format })
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Groq chat request failed: ${response.status} ${response.statusText} \u2013 ${errorText}`);
  }
  return await response.json();
}
async function invokeInterviewModel(request) {
  if (process.env.GROQ_API_KEY) {
    try {
      return await invokeGroqChat(request);
    } catch {
      return await invokeLLM(request);
    }
  }
  return invokeLLM(request);
}
async function transcribeDirectly(audio, mimeType, prompt) {
  const apiKey = process.env.GROQ_API_KEY;
  const extension = { "audio/webm": "webm", "audio/mp4": "mp4", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/ogg": "ogg" }[mimeType];
  const audioBytes = new Uint8Array(audio.byteLength);
  audioBytes.set(audio);
  const form = new FormData();
  form.set("file", new Blob([audioBytes], { type: mimeType }), `seekho-answer.${extension}`);
  form.set("model", "whisper-large-v3-turbo");
  form.set("language", "en");
  form.set("prompt", prompt);
  form.set("response_format", "json");
  if (apiKey) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form });
      if (response.ok) {
        const payload = await response.json();
        if (typeof payload.text === "string" && payload.text.trim()) return payload.text.trim();
      }
    } catch {
    }
  }
  const uploaded = await storagePut(`seekho/answers/temp/${nanoid()}`, audio, mimeType);
  const signedUrl = await storageGetSignedUrl(uploaded.key);
  const transcription = await transcribeAudio({ audioUrl: signedUrl, language: "en", prompt });
  if ("error" in transcription) {
    const message = transcription.details?.includes("usage exhausted") ? "speech transcription is temporarily unavailable because its service quota has been reached. please try again later." : transcription.error;
    throw new TRPCError3({ code: "BAD_REQUEST", message, cause: transcription });
  }
  return transcription.text.trim();
}
function extractContent(response) {
  const content = response.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : "";
}
async function makeQuestion(session, priorAnswers = session.answers) {
  const questionNumber = questionNumberFor(priorAnswers.length);
  const difficulty = difficultyForQuestion(questionNumber);
  const prior = priorAnswers.length ? priorAnswers.map((answer) => `Q: ${answer.question}
A: ${answer.transcript}`).join("\n\n") : "none";
  const fallback = { question: `Tell me about a decision you would make in a ${session.role} role, and how you would know it was the right one.`, focus: roleFocus(session.role), followUpHint: "make your assumptions clear" };
  const response = await invokeInterviewModel({
    model: SEEKHO_TEXT_MODEL,
    max_tokens: 400,
    response_format: { type: "json_schema", json_schema: { name: "interview_question", strict: true, schema: { type: "object", properties: { question: { type: "string" }, focus: { type: "string" }, followUpHint: { type: "string" } }, required: ["question", "focus", "followUpHint"], additionalProperties: false } } },
    messages: [
      { role: "system", content: "You are seekho, a warm technical interview coach. Return JSON only. Ask one concise, spoken interview question. The question must be practical, specific, and answerable in under two minutes. Do not repeat prior topics. Respect the requested difficulty: easy means familiar fundamentals and clear examples; intermediate means applied reasoning; advanced means trade-offs and system decisions; challenging means nuanced constraints and judgement." },
      { role: "user", content: `candidate: ${session.name}
target role: ${session.role}
role focus: ${roleFocus(session.role)}
resume context: ${session.resumeSummary || "no resume supplied"}
question number: ${questionNumber} of ${MAX_QUESTIONS}
difficulty: ${difficulty}
prior answers: ${prior}

Return exactly: {"question":"...","focus":"...","followUpHint":"..."}` }
    ]
  });
  const result = parseJson(extractContent(response), fallback);
  return { question: result.question || fallback.question, focus: result.focus || fallback.focus, followUpHint: result.followUpHint || fallback.followUpHint };
}
async function evaluateAnswer(session, question, transcript) {
  const fallback = { score: 3, feedback: "you gave a clear starting point. make one trade-off and one outcome more explicit next time.", strength: "you stayed on the question", focus: "name the evidence behind your choice", nextCue: "start with the context, then your decision" };
  const response = await invokeInterviewModel({
    model: SEEKHO_TEXT_MODEL,
    max_tokens: 500,
    response_format: { type: "json_schema", json_schema: { name: "answer_feedback", strict: true, schema: { type: "object", properties: { score: { type: "number" }, feedback: { type: "string" }, strength: { type: "string" }, focus: { type: "string" }, nextCue: { type: "string" } }, required: ["score", "feedback", "strength", "focus", "nextCue"], additionalProperties: false } } },
    messages: [
      { role: "system", content: "You are a precise, kind interview coach. Return JSON only. Judge the candidate answer for relevance, clarity, technical accuracy, and depth. Keep every value lowercase and conversational. Never invent details the candidate did not say. Use only whole-number scores from 2 to 5: give 2 only when an answer has almost no useful substance or is clearly off-topic; give 3 for any basic or slightly correct on-topic answer; give 4 when an answer gives a reasonably correct explanation with more than one relevant technical choice, metric, or trade-off; give 5 only for an excellent, technically sound answer." },
      { role: "user", content: `role: ${session.role}
focus: ${roleFocus(session.role)}
question: ${question}
answer transcript: ${transcript}

Return exactly: {"score":2,"feedback":"one short sentence","strength":"one short phrase","focus":"one short phrase","nextCue":"one short sentence"}` }
    ]
  });
  const result = parseJson(extractContent(response), fallback);
  return { score: normaliseScore(result.score), feedback: result.feedback || fallback.feedback, strength: result.strength || fallback.strength, focus: result.focus || fallback.focus, nextCue: result.nextCue || fallback.nextCue };
}
async function makeReport(session) {
  const average = session.answers.reduce((sum, answer) => sum + answer.feedback.score, 0) / Math.max(1, session.answers.length);
  const fallback = { overallScore: Math.round(average * 10) / 10, summary: "you completed a full spoken practice round. your next gains will come from making your decision process more visible.", strengths: session.answers.slice(0, 2).map((answer) => answer.feedback.strength), focusAreas: session.answers.slice(0, 2).map((answer) => answer.feedback.focus), nextSteps: ["repeat one answer using a clear situation, decision, and outcome", "practise naming your assumptions before you explain your solution"] };
  const responses = session.answers.map((answer, index) => `${index + 1}. ${answer.question}
answer: ${answer.transcript}
coach: ${answer.feedback.feedback}`).join("\n\n");
  const response = await invokeInterviewModel({
    model: SEEKHO_TEXT_MODEL,
    max_tokens: 800,
    response_format: { type: "json_schema", json_schema: { name: "interview_report", strict: true, schema: { type: "object", properties: { overallScore: { type: "number" }, summary: { type: "string" }, strengths: { type: "array", items: { type: "string" } }, focusAreas: { type: "array", items: { type: "string" } }, nextSteps: { type: "array", items: { type: "string" } } }, required: ["overallScore", "summary", "strengths", "focusAreas", "nextSteps"], additionalProperties: false } } },
    messages: [
      { role: "system", content: "You are seekho, an encouraging interview coach. Return JSON only. Create an honest final report based only on the supplied answers. Use lower-case, direct language. Keep the summary below 45 words." },
      { role: "user", content: `candidate: ${session.name}
role: ${session.role}
answers:
${responses}

Return exactly: {"overallScore":4.2,"summary":"...","strengths":["...","..."],"focusAreas":["...","..."],"nextSteps":["...","..."]}` }
    ]
  });
  const result = parseJson(extractContent(response), fallback);
  return { overallScore: typeof result.overallScore === "number" ? result.overallScore : fallback.overallScore, summary: result.summary || fallback.summary, strengths: result.strengths?.length ? result.strengths : fallback.strengths, focusAreas: result.focusAreas?.length ? result.focusAreas : fallback.focusAreas, nextSteps: result.nextSteps?.length ? result.nextSteps : fallback.nextSteps };
}
async function processUploadedAnswer(session, audio, mimeType) {
  const prompt = `Transcribe an interview answer for a ${session.role} role. Preserve technical terms such as RAG, LLM, LangChain, multimodal, and MCP.`;
  let transcript;
  try {
    transcript = await transcribeDirectly(audio, mimeType, prompt);
  } catch (error) {
    if (error instanceof TRPCError3) throw error;
    throw new TRPCError3({ code: "BAD_REQUEST", message: "we couldn't transcribe your answer. please record it again.", cause: error });
  }
  if (!transcript) throw new TRPCError3({ code: "BAD_REQUEST", message: "your recording was empty. try speaking a little closer to the microphone." });
  const question = session.questions[session.answers.length];
  if (!question) throw new TRPCError3({ code: "CONFLICT", message: "all questions have already been completed" });
  const aiError = new TRPCError3({ code: "INTERNAL_SERVER_ERROR", message: "our ai hit a temporary problem. please retry this answer." });
  let feedback;
  try {
    feedback = await evaluateAnswer(session, question, transcript);
  } catch {
    throw aiError;
  }
  const nextQuestionTask = isRoundComplete(session.answers.length + 1) ? Promise.resolve(null) : makeQuestion(session, [...session.answers, { question, transcript }]);
  session.answers.push({ question, transcript, feedback });
  const complete = isRoundComplete(session.answers.length);
  if (complete) {
    let report;
    try {
      report = await makeReport(session);
    } catch {
      throw aiError;
    }
    return { transcript, feedback, complete: true, report };
  }
  let next;
  try {
    const nextQuestion = await nextQuestionTask;
    if (!nextQuestion) throw aiError;
    next = nextQuestion;
  } catch {
    throw aiError;
  }
  session.questions.push(next.question);
  return { transcript, feedback, complete: false, nextQuestion: next.question, nextFocus: next.focus, questionNumber: questionNumberFor(session.answers.length), maxQuestions: MAX_QUESTIONS };
}
async function submitRecordedAnswer(sessionId, audio, mimeType) {
  const session = sessions.get(sessionId);
  if (!session) throw new TRPCError3({ code: "NOT_FOUND", message: "this practice session has expired. start another one." });
  if (!audio.byteLength) throw new TRPCError3({ code: "BAD_REQUEST", message: "we didn't receive an audio sample. check your microphone permission and try again." });
  if (audio.byteLength > MAX_ANSWER_BYTES) throw new TRPCError3({ code: "PAYLOAD_TOO_LARGE", message: "keep each answer recording under 16mb" });
  return processUploadedAnswer(session, audio, mimeType);
}
function discardExpiredAnswerUploads() {
  const cutoff = Date.now() - ANSWER_UPLOAD_TTL_MS;
  pendingAnswerUploads.forEach((upload, uploadId) => {
    if (upload.createdAt < cutoff) pendingAnswerUploads.delete(uploadId);
  });
}
var appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true
      };
    })
  }),
  interview: router({
    start: publicProcedure.input(z2.object({ name: z2.string().trim().min(1).max(80), role: z2.string().trim().min(2).max(120), resume: z2.object({ name: z2.string().max(180), text: z2.string().trim().min(1).max(16e3) }).optional() })).mutation(async ({ input }) => {
      const session = { id: nanoid(), name: input.name, role: input.role, resumeSummary: input.resume?.text.slice(0, 2500) ?? "", questions: [], answers: [], createdAt: Date.now() };
      const first = openingQuestionForRole(session.role);
      session.questions.push(first.question);
      sessions.set(session.id, session);
      return { sessionId: session.id, questionNumber: 1, maxQuestions: MAX_QUESTIONS, question: first.question, focus: first.focus, resumeUsed: Boolean(input.resume) };
    }),
    submitAnswerChunk: publicProcedure.input(z2.object({ sessionId: z2.string().min(1), uploadId: z2.string().min(1).max(100), chunkIndex: z2.number().int().min(0).max(512), chunkCount: z2.number().int().min(1).max(512), mimeType: z2.enum(["audio/webm", "audio/mp4", "audio/mpeg", "audio/wav", "audio/ogg"]), audioBase64: z2.string().min(1).max(MAX_ANSWER_CHUNK_BASE64_CHARS) })).mutation(async ({ input }) => {
      discardExpiredAnswerUploads();
      if (!sessions.has(input.sessionId)) throw new TRPCError3({ code: "NOT_FOUND", message: "this practice session has expired. start another one." });
      const audio = Buffer.from(input.audioBase64, "base64");
      if (!audio.byteLength) throw new TRPCError3({ code: "BAD_REQUEST", message: "we didn't receive an audio sample. check your microphone permission and try again." });
      let upload = pendingAnswerUploads.get(input.uploadId);
      if (!upload) {
        if (input.chunkIndex !== 0) throw new TRPCError3({ code: "CONFLICT", message: "the recording upload expired. record your answer again and retry." });
        upload = { sessionId: input.sessionId, mimeType: input.mimeType, chunkCount: input.chunkCount, nextChunkIndex: 0, chunks: [], totalBytes: 0, createdAt: Date.now() };
        pendingAnswerUploads.set(input.uploadId, upload);
      }
      if (upload.sessionId !== input.sessionId || upload.mimeType !== input.mimeType || upload.chunkCount !== input.chunkCount || input.chunkIndex !== upload.nextChunkIndex) {
        pendingAnswerUploads.delete(input.uploadId);
        throw new TRPCError3({ code: "CONFLICT", message: "the recording upload was interrupted. record your answer again and retry." });
      }
      if (upload.totalBytes + audio.byteLength > MAX_ANSWER_BYTES) {
        pendingAnswerUploads.delete(input.uploadId);
        throw new TRPCError3({ code: "PAYLOAD_TOO_LARGE", message: "keep each answer recording under 16mb" });
      }
      upload.chunks.push(audio);
      upload.totalBytes += audio.byteLength;
      upload.nextChunkIndex += 1;
      if (upload.nextChunkIndex < upload.chunkCount) return { complete: false, receivedChunks: upload.nextChunkIndex, totalChunks: upload.chunkCount };
      pendingAnswerUploads.delete(input.uploadId);
      return { complete: true, receivedChunks: upload.chunkCount, totalChunks: upload.chunkCount, result: await submitRecordedAnswer(input.sessionId, Buffer.concat(upload.chunks), input.mimeType) };
    })
  })
});

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";

// server/db.ts
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

// drizzle/schema.ts
import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
var users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});

// server/db.ts
var _db = null;
async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values = {
      openId: user.openId
    };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}

// server/_core/sdk.ts
var isNonEmptyString2 = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
  decodeState(state) {
    return decodeOAuthState(state).redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString2(openId) || !isNonEmptyString2(appId) || !isNonEmptyString2(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }
    const session = await this.verifySession(sessionToken);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var CRON_OPEN_ID_PREFIX = "cron_";
function buildCronUser(userInfo) {
  const now = /* @__PURE__ */ new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? void 0,
    isCron: true
  };
}
var sdk = new SDKServer();

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// api/trpc.ts
var handler = (req) => fetchRequestHandler({
  endpoint: "/api/trpc",
  req,
  router: appRouter,
  createContext,
  onError({ path, error }) {
    console.error(`tRPC error on ${path}:`, error.message);
  }
});
var trpc_default = handler;
export {
  trpc_default as default,
  handler
};
