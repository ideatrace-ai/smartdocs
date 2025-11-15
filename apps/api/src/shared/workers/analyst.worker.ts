import { db } from "../database";
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

      const structuredData = await this.getStructuredDataFromLLM(full_text);

      if (!structuredData) {
        const reason = GatekeeperRejectionReason.LLM_NO_RESPONSE;
        console.error("Failed to get structured data from LLM.");
        await this.updateStatus(audio_hash, ProcessingStatus.FAILED, reason);
        return { status: "analyst_failed", reason };
      }

      console.log("Saving structured data to the database...");
      await db.insert(requirementDocuments).values({
        audio_hash: audio_hash,
        document_data: structuredData,
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

  private async getStructuredDataFromLLM(text: string): Promise<object | null> {
    try {
      const response = await fetch(
        `${envs.services.OLLAMA_API_URL}/api/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "deepseek-coder",
            system: analystContext,
            prompt: text,
            stream: false,
            format: "json",
          }),
        },
      );

      if (!response.ok) {
        throw new Error(
          `Ollama API request failed with status ${response.status}`,
        );
      }

      const result = await response.json();
      const jsonString = (result as { response: string }).response;

      return JSON.parse(jsonString);
    } catch (error) {
      console.error("Error getting structured data from Ollama:", error);
      return null;
    }
  }
}
