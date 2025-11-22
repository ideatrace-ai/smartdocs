import { db } from "../database";
import path from "path";
import fs from "fs/promises";
import { processingStatus, requirementDocuments } from "../database/schema";
import { analystContext } from "./prompts/analyst-prompt";
import { envs } from "../config/envs";
import {
  ProcessingStatus,
  GatekeeperRejectionReason,
} from "../utils/constants";

export interface AnalystPayload {
  audio_hash: string;
  full_text: string;
}

export class AnalystWorker {
  private async updateStatus(
    audio_hash: string,
    status: string,
    details?: string,
  ) {
    await db
      .insert(processingStatus)
      .values({ audio_hash, status, details })
      .onConflictDoUpdate({
        target: processingStatus.audio_hash,
        set: { status, details, updated_at: new Date() },
      });
  }

  async perform(payload: AnalystPayload) {
    const { audio_hash, full_text } = payload;
    console.log("AnalystWorker received:", audio_hash);

    try {
      await this.updateStatus(audio_hash, ProcessingStatus.ANALYZING);

      const markdownContent = await this.getMarkdownFromLLM(full_text);

      if (!markdownContent) {
        const reason = GatekeeperRejectionReason.LLM_NO_RESPONSE;
        console.error("Failed to get markdown data from LLM.");
        await this.updateStatus(audio_hash, ProcessingStatus.FAILED, reason);
        return { status: "analyst_failed", reason };
      }

      const outputDir = path.join(process.cwd(), "data", "outputs");
      const fileName = `${audio_hash}.md`;
      const filePath = path.join(outputDir, fileName);

      console.log(`Saving markdown document to: ${filePath}`);
      await fs.writeFile(filePath, markdownContent);

      console.log("Saving document metadata to the database...");
      await db.insert(requirementDocuments).values({
        audio_hash: audio_hash,
        document_data: { filePath: filePath },
      });

      await this.updateStatus(audio_hash, ProcessingStatus.COMPLETE);
      console.log("Successfully saved document for audio_hash:", audio_hash);

      return { status: "analyst_complete" };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("Error in AnalystWorker:", errorMessage);
      await this.updateStatus(
        audio_hash,
        ProcessingStatus.FAILED,
        errorMessage,
      );
      return { status: "analyst_failed" };
    }
  }

  private async getMarkdownFromLLM(text: string): Promise<string | null> {
    try {
      const response = await fetch(
        `${envs.services.OLLAMA_API_URL}/api/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: envs.analytics.ANALYTICS_MODEL,
            system: analystContext,
            prompt: text,
            stream: false,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(
          `Ollama API request failed with status ${response.status}`,
        );
      }

      const result = await response.json();
      return (result as { response: string }).response;
    } catch (error) {
      console.error("Error getting markdown from Ollama:", error);
      return null;
    }
  }
}
