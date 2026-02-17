import { envs } from "../config/envs";
import { logger } from "../utils/logger";

const log = logger.child({ service: "ollama" });

const DEFAULT_TIMEOUT_MS = 120_000; // 2 minutes
const DEFAULT_MAX_RETRIES = 3;
const BASE_DELAY_MS = 1_000;

interface OllamaGenerateOptions {
  model: string;
  prompt: string;
  system?: string;
  timeoutMs?: number;
  maxRetries?: number;
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

export async function ollamaGenerate(
  options: OllamaGenerateOptions,
): Promise<string | null> {
  const {
    model,
    prompt,
    system,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRetries = DEFAULT_MAX_RETRIES,
  } = options;

  const url = `${envs.services.OLLAMA_API_URL}/api/generate`;
  const body: Record<string, unknown> = { model, prompt, stream: false };
  if (system) body.system = system;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        timeoutMs,
      );

      if (!response.ok) {
        throw new Error(
          `Ollama API returned status ${response.status}`,
        );
      }

      const result = await response.json();
      return (result as { response: string }).response;
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      const errorMsg =
        error instanceof Error ? error.message : String(error);

      log.error(`Request failed (attempt ${attempt}/${maxRetries}): ${errorMsg}`, { model });

      if (isLastAttempt) {
        return null;
      }

      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      await sleep(delay);
    }
  }

  return null;
}
