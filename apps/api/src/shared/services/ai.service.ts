import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { envs } from "../config/envs";
import { logger } from "../utils/logger";
import fs from "fs/promises";

const log = logger.child({ service: "ai" });

const DEFAULT_MAX_RETRIES = 3;

export interface AIGenerateOptions {
  model?: string;
  prompt: string;
  system?: string;
  timeoutMs?: number;
  maxRetries?: number;
  provider?: "gemini" | "openai" | "anthropic" | "openrouter" | "ollama";
  apiKey?: string;
}

export interface AITranscriptionOptions {
  model?: string;
  filePath: string;
  apiKey?: string;
}

function getModel(options: AIGenerateOptions) {
  let provider = options.provider || envs.ai.AI_PROVIDER;

  if (!provider) {
    if (options.apiKey || envs.ai.GEMINI_API_KEY) provider = "gemini";
    else if (options.apiKey || envs.ai.OPENAI_API_KEY) provider = "openai";
    else if (options.apiKey || envs.ai.ANTHROPIC_API_KEY) provider = "anthropic";
    else if (options.apiKey || envs.ai.OPENROUTER_API_KEY) provider = "openrouter";
    else provider = "ollama";
  }

  const rawModelId = options.model || envs.ai.AI_MODEL;

  const isLocalModel = rawModelId && !rawModelId.includes("/") && !rawModelId.startsWith("gpt-") && !rawModelId.startsWith("gemini-") && !rawModelId.startsWith("claude-");
  const modelId = (provider !== "ollama" && isLocalModel) ? undefined : rawModelId;

  switch (provider) {
    case "openai": {
      const openai = createOpenAI({
        apiKey: options.apiKey || envs.ai.OPENAI_API_KEY,
      });
      return openai(modelId || "gpt-4o-mini");
    }
    case "gemini": {
      const google = createGoogleGenerativeAI({
        apiKey: options.apiKey || envs.ai.GEMINI_API_KEY,
      });
      return google(modelId || "gemini-2.0-flash");
    }
    case "anthropic": {
      const anthropic = createAnthropic({
        apiKey: options.apiKey || envs.ai.ANTHROPIC_API_KEY,
      });
      return anthropic(modelId || "claude-3-5-sonnet-20240620");
    }
    case "openrouter": {
      const openrouter = createOpenAI({
        apiKey: options.apiKey || envs.ai.OPENROUTER_API_KEY,
        baseURL: "https://openrouter.ai/api/v1",
      });
      return openrouter(modelId || "google/gemini-2.0-flash-001");
    }
    case "ollama": {
      const ollama = createOpenAI({
        baseURL: `${envs.services.OLLAMA_API_URL}/v1`,
        apiKey: "ollama",
      });
      return ollama.chat(modelId || envs.analytics.ANALYTICS_MODEL);
    }
    default:
      throw new Error(`Unsupported AI provider: ${provider}`);
  }
}

async function unloadOllamaModel(modelId: string) {
  const baseUrl = envs.services.OLLAMA_API_URL;
  try {
    const res = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: modelId, keep_alive: 0 }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      log.info("Ollama model unloaded from memory", { model: modelId });
    } else {
      log.warn(`Failed to unload Ollama model (status ${res.status})`, { model: modelId });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`Failed to unload Ollama model: ${msg}`, { model: modelId });
  }
}

async function checkOllamaAvailability(modelId: string) {
  const baseUrl = envs.services.OLLAMA_API_URL;
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) {
      return { ok: false as const, reason: `Ollama API returned status ${res.status}` };
    }
    const data = (await res.json()) as { models?: { name: string }[] };
    const models = data.models ?? [];
    const normalizedTarget = modelId.includes(":") ? modelId : `${modelId}:latest`;
    const found = models.some((m) => m.name === normalizedTarget || m.name === modelId);
    if (!found) {
      const available = models.map((m) => m.name).join(", ") || "(none)";
      return { ok: false as const, reason: `Model "${modelId}" not found in Ollama. Available: ${available}` };
    }
    return { ok: true as const };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false as const, reason: `Cannot connect to Ollama at ${baseUrl}: ${msg}` };
  }
}

export async function aiGenerate(
  options: AIGenerateOptions,
): Promise<string | null> {
  const {
    maxRetries = DEFAULT_MAX_RETRIES,
  } = options;

  const provider = options.provider || envs.ai.AI_PROVIDER || "ollama";
  const ollamaModelId = provider === "ollama"
    ? (options.model || envs.ai.AI_MODEL || envs.analytics.ANALYTICS_MODEL)
    : null;

  try {
    if (provider === "ollama" && ollamaModelId) {
      const check = await checkOllamaAvailability(ollamaModelId);
      if (!check.ok) {
        log.error(`Ollama pre-flight check failed: ${check.reason}`);
        return null;
      }
      log.info("Ollama pre-flight check passed", { model: ollamaModelId });
    }

    const model = getModel(options);

    log.info(`Generating text with Vercel AI SDK`, {
      provider: provider,
      model: options.model || "default"
    });

    const startTime = Date.now();

    const { text } = await generateText({
      model,
      prompt: options.prompt,
      system: options.system,
      maxRetries: maxRetries,
      abortSignal: options.timeoutMs
        ? AbortSignal.timeout(options.timeoutMs)
        : undefined,
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log.info(`AI generation completed in ${elapsed}s`, { provider, chars: text.length });

    return text;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    if (error instanceof Error && error.name === "TimeoutError") {
      log.error(`AI generation timed out after ${(options.timeoutMs || 0) / 1000}s (model was processing but too slow)`, { provider });
    } else if (errorMsg.includes("ECONNREFUSED")) {
      log.error(`AI generation failed: connection refused. Is the ${provider} service running?`, { provider });
    } else if (errorMsg.includes("Not Found") || errorMsg.includes("404")) {
      log.error(`AI generation failed: endpoint not found. Check provider/model compatibility`, { provider, model: options.model });
    } else {
      log.error(`AI generation failed: ${errorMsg}`, { provider });
    }

    return null;
  } finally {
    if (ollamaModelId) {
      await unloadOllamaModel(ollamaModelId);
    }
  }
}

export async function aiTranscription(
  options: AITranscriptionOptions,
): Promise<string | null> {
  try {
    const apiKey = options.apiKey || envs.ai.OPENAI_API_KEY;
    const model = options.model || "whisper-1";

    if (!apiKey) {
      throw new Error("OpenAI API key is required for cloud transcription");
    }

    log.info(`Generating transcription with OpenAI Whisper Cloud API`, {
      model: model
    });

    const audioBuffer = await fs.readFile(options.filePath);
    const formData = new FormData();
    const blob = new Blob([audioBuffer]);
    formData.append("file", blob, "audio.wav");
    formData.append("model", model);

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenAI Whisper API returned status ${response.status}: ${errorBody}`);
    }

    const result = (await response.json()) as { text: string };
    return result.text;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(`AI transcription failed: ${errorMsg}`);
    return null;
  }
}
