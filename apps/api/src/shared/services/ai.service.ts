import { envs } from "../config/envs";
import { logger } from "../utils/logger";

const log = logger.child({ service: "ai" });

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_RETRIES = 3;
const BASE_DELAY_MS = 1_000;

export interface AIGenerateOptions {
  model?: string;
  prompt: string;
  system?: string;
  timeoutMs?: number;
  maxRetries?: number;
  provider?: "gemini" | "openai" | "anthropic" | "openrouter" | "ollama";
  apiKey?: string;
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateOllama(options: AIGenerateOptions): Promise<string | null> {
  const model = options.model || envs.analytics.ANALYTICS_MODEL;
  const url = `${envs.services.OLLAMA_API_URL}/api/generate`;
  const body: Record<string, unknown> = {
    model,
    prompt: options.prompt,
    stream: false,
  };
  if (options.system) body.system = options.system;

  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    options.timeoutMs || DEFAULT_TIMEOUT_MS,
  );

  if (!response.ok) {
    throw new Error(`Ollama API returned status ${response.status}`);
  }

  const result = await response.json();
  return (result as { response: string }).response;
}

async function generateGemini(options: AIGenerateOptions): Promise<string | null> {
  const apiKey = options.apiKey || envs.ai.GEMINI_API_KEY;
  const model = options.model || envs.ai.AI_MODEL || "gemini-1.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body: any = {
    contents: [{ parts: [{ text: options.prompt }] }],
  };

  if (options.system) {
    body.system_instruction = {
      parts: [{ text: options.system }]
    };
  }

  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    options.timeoutMs || DEFAULT_TIMEOUT_MS,
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini API returned status ${response.status}: ${errorBody}`);
  }

  const result = await response.json();
  return (result as any).candidates?.[0]?.content?.parts?.[0]?.text || null;
}

async function generateOpenAI(options: AIGenerateOptions): Promise<string | null> {
  const apiKey = options.apiKey || envs.ai.OPENAI_API_KEY;
  const model = options.model || envs.ai.AI_MODEL || "gpt-4o-mini";
  const url = "https://api.openai.com/v1/chat/completions";

  const messages = [];
  if (options.system) {
    messages.push({ role: "system", content: options.system });
  }
  messages.push({ role: "user", content: options.prompt });

  const body = {
    model,
    messages,
  };

  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    },
    options.timeoutMs || DEFAULT_TIMEOUT_MS,
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI API returned status ${response.status}: ${errorBody}`);
  }

  const result = await response.json();
  return (result as any).choices?.[0]?.message?.content || null;
}

async function generateAnthropic(options: AIGenerateOptions): Promise<string | null> {
  const apiKey = options.apiKey || envs.ai.ANTHROPIC_API_KEY;
  const model = options.model || envs.ai.AI_MODEL || "claude-3-5-sonnet-20240620";
  const url = "https://api.anthropic.com/v1/messages";

  const body = {
    model,
    max_tokens: 4096,
    system: options.system,
    messages: [{ role: "user", content: options.prompt }],
  };

  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    },
    options.timeoutMs || DEFAULT_TIMEOUT_MS,
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Anthropic API returned status ${response.status}: ${errorBody}`);
  }

  const result = await response.json();
  return (result as any).content?.[0]?.text || null;
}

async function generateOpenRouter(options: AIGenerateOptions): Promise<string | null> {
  const apiKey = options.apiKey || envs.ai.OPENROUTER_API_KEY;
  const model = options.model || envs.ai.AI_MODEL || "google/gemini-flash-1.5";
  const url = "https://openrouter.ai/api/v1/chat/completions";

  const messages = [];
  if (options.system) {
    messages.push({ role: "system", content: options.system });
  }
  messages.push({ role: "user", content: options.prompt });

  const body = {
    model,
    messages,
  };

  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://smartdocs.ai",
        "X-Title": "SmartDocs",
      },
      body: JSON.stringify(body),
    },
    options.timeoutMs || DEFAULT_TIMEOUT_MS,
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenRouter API returned status ${response.status}: ${errorBody}`);
  }

  const result = await response.json();
  return (result as any).choices?.[0]?.message?.content || null;
}

export async function aiGenerate(
  options: AIGenerateOptions,
): Promise<string | null> {
  const {
    maxRetries = DEFAULT_MAX_RETRIES,
  } = options;

  let provider = options.provider || envs.ai.AI_PROVIDER;

  // Auto-detect provider based on keys if not specified
  if (!provider) {
    if (options.apiKey || envs.ai.GEMINI_API_KEY) provider = "gemini";
    else if (options.apiKey || envs.ai.OPENAI_API_KEY) provider = "openai";
    else if (options.apiKey || envs.ai.ANTHROPIC_API_KEY) provider = "anthropic";
    else if (options.apiKey || envs.ai.OPENROUTER_API_KEY) provider = "openrouter";
    else provider = "ollama";
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      log.info(`Generating with ${provider} (attempt ${attempt}/${maxRetries})`);
      
      switch (provider) {
        case "gemini":
          return await generateGemini(options);
        case "openai":
          return await generateOpenAI(options);
        case "anthropic":
          return await generateAnthropic(options);
        case "openrouter":
          return await generateOpenRouter(options);
        case "ollama":
        default:
          return await generateOllama(options);
      }
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      const errorMsg =
        error instanceof Error ? error.message : String(error);

      log.error(`Request failed (attempt ${attempt}/${maxRetries}): ${errorMsg}`, { provider });

      if (isLastAttempt) {
        return null;
      }

      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      await sleep(delay);
    }
  }

  return null;
}
