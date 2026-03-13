import { generateText, generateTranscription } from "ai";
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

  // Auto-detect provider based on keys if not specified
  if (!provider) {
    if (options.apiKey || envs.ai.GEMINI_API_KEY) provider = "gemini";
    else if (options.apiKey || envs.ai.OPENAI_API_KEY) provider = "openai";
    else if (options.apiKey || envs.ai.ANTHROPIC_API_KEY) provider = "anthropic";
    else if (options.apiKey || envs.ai.OPENROUTER_API_KEY) provider = "openrouter";
    else provider = "ollama";
  }

  const modelId = options.model || envs.ai.AI_MODEL;

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
      return google(modelId || "gemini-1.5-flash");
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
      return openrouter(modelId || "google/gemini-flash-1.5");
    }
    case "ollama": {
      const ollama = createOpenAI({
        baseURL: `${envs.services.OLLAMA_API_URL}/v1`,
        apiKey: "ollama", // placeholder
      });
      return ollama(modelId || envs.analytics.ANALYTICS_MODEL);
    }
    default:
      throw new Error(`Unsupported AI provider: ${provider}`);
  }
}

export async function aiGenerate(
  options: AIGenerateOptions,
): Promise<string | null> {
  const {
    maxRetries = DEFAULT_MAX_RETRIES,
  } = options;

  try {
    const model = getModel(options);
    
    log.info(`Generating text with Vercel AI SDK`, { 
      provider: options.provider || "auto",
      model: options.model || "default"
    });

    const { text } = await generateText({
      model,
      prompt: options.prompt,
      system: options.system,
      maxRetries: maxRetries,
      abortSignal: options.timeoutMs 
        ? AbortSignal.timeout(options.timeoutMs) 
        : undefined,
    });

    return text;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(`AI generation failed: ${errorMsg}`);
    return null;
  }
}

export async function aiTranscription(
  options: AITranscriptionOptions,
): Promise<string | null> {
  try {
    const openai = createOpenAI({
      apiKey: options.apiKey || envs.ai.OPENAI_API_KEY,
    });

    const model = openai.transcription(options.model || "whisper-1");
    const audioFile = await fs.readFile(options.filePath);

    log.info(`Generating transcription with OpenAI Whisper`, {
      model: options.model || "whisper-1"
    });

    const { text } = await generateTranscription({
      model,
      audio: audioFile,
    });

    return text;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(`AI transcription failed: ${errorMsg}`);
    return null;
  }
}
