import path from "path";
import fs from "fs/promises";
import { db } from "../database";
import { requirementDocuments } from "../database/schema";
import { analystContext } from "./prompts/analyst-prompt";
import { envs } from "../config/envs";
import {
  ProcessingStatus,
  GatekeeperRejectionReason,
} from "../utils/constants";
import { updateStatus } from "../utils/update-status";
import { aiGenerate } from "../services/ai.service";
import { logger } from "../utils/logger";

export interface AnalystPayload {
  audio_hash: string;
  full_text: string;
  api_key?: string;
  provider?: "gemini" | "openai" | "anthropic" | "ollama";
}

export class AnalystWorker {
  async perform(payload: AnalystPayload) {
    const { audio_hash, full_text, api_key, provider } = payload;
    const log = logger.child({ worker: "analyst", audio_hash });
    log.info("Received payload");

    try {
      await updateStatus(audio_hash, ProcessingStatus.ANALYZING);

      const markdownContent = await aiGenerate({
        model: envs.analytics.ANALYTICS_MODEL,
        prompt: full_text,
        system: analystContext,
        timeoutMs: 180_000,
        maxRetries: 3,
        apiKey: api_key,
        provider: provider,
      });

      if (!markdownContent) {
        const reason = GatekeeperRejectionReason.LLM_NO_RESPONSE;
        log.error("Failed to get markdown data from LLM after all retries");
        await updateStatus(audio_hash, ProcessingStatus.FAILED, reason);
        return { status: "analyst_failed", reason };
      }

      const outputDir = path.join(process.cwd(), "data", "outputs");
      await fs.mkdir(outputDir, { recursive: true });
      const fileName = `${audio_hash}.md`;
      const filePath = path.join(outputDir, fileName);

      log.info("Saving markdown document", { filePath });
      await fs.writeFile(filePath, markdownContent);

      const stats = await fs.stat(filePath);
      if (stats.size === 0) {
        throw new Error("Written file is empty");
      }

      log.info("Saving document metadata to database");
      await db
        .insert(requirementDocuments)
        .values({
          audio_hash: audio_hash,
          document_data: { filePath: filePath },
        })
        .onConflictDoUpdate({
          target: requirementDocuments.audio_hash,
          set: { document_data: { filePath: filePath } },
        });

      await updateStatus(audio_hash, ProcessingStatus.COMPLETE);
      log.info("Document saved successfully");

      return { status: "analyst_complete" };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      log.error("Analysis failed", { error: errorMessage });
      await updateStatus(
        audio_hash,
        ProcessingStatus.FAILED,
        `Analysis failed: ${errorMessage}`,
      );
      return { status: "analyst_failed" };
    }
  }
}
