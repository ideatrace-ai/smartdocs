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
import { ollamaGenerate } from "../services/ollama.service";

export interface AnalystPayload {
  audio_hash: string;
  full_text: string;
}

export class AnalystWorker {
  async perform(payload: AnalystPayload) {
    const { audio_hash, full_text } = payload;
    console.log("AnalystWorker received:", audio_hash);

    try {
      await updateStatus(audio_hash, ProcessingStatus.ANALYZING);

      const markdownContent = await ollamaGenerate({
        model: envs.analytics.ANALYTICS_MODEL,
        prompt: full_text,
        system: analystContext,
        timeoutMs: 180_000, // 3 minutes for longer generations
        maxRetries: 3,
      });

      if (!markdownContent) {
        const reason = GatekeeperRejectionReason.LLM_NO_RESPONSE;
        console.error("Failed to get markdown data from LLM after all retries.");
        await updateStatus(audio_hash, ProcessingStatus.FAILED, reason);
        return { status: "analyst_failed", reason };
      }

      const outputDir = path.join(process.cwd(), "data", "outputs");
      await fs.mkdir(outputDir, { recursive: true });
      const fileName = `${audio_hash}.md`;
      const filePath = path.join(outputDir, fileName);

      console.log(`Saving markdown document to: ${filePath}`);
      await fs.writeFile(filePath, markdownContent);

      // Verify file was written successfully
      const stats = await fs.stat(filePath);
      if (stats.size === 0) {
        throw new Error("Written file is empty");
      }

      console.log("Saving document metadata to the database...");
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
      console.log("Successfully saved document for audio_hash:", audio_hash);

      return { status: "analyst_complete" };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("Error in AnalystWorker:", errorMessage);
      await updateStatus(
        audio_hash,
        ProcessingStatus.FAILED,
        `Analysis failed: ${errorMessage}`,
      );
      return { status: "analyst_failed" };
    }
  }
}
