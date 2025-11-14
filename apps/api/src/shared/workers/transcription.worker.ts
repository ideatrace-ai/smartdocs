import { queueService } from "../services/queue.service";
import { db } from "../../shared/database";
import { processingStatus } from "../../shared/database/schema";
import { whisper } from "@lumen-labs-dev/whisper-node";
import { ProcessingStatus, QueueNames } from "../constants";

export interface TranscriptionPayload {
  audio_hash: string;
  file_path: string;
}

export class TranscriptionWorker {
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

  async perform(
    payload: TranscriptionPayload,
  ):
 Promise<{ status: string; transcript: string }> {
    const { audio_hash, file_path } = payload;
    console.log("TranscriptionWorker received:", audio_hash);

    try {
      await this.updateStatus(audio_hash, ProcessingStatus.TRANSCRIBING);

      console.log(`Starting transcription for audio_hash: ${audio_hash}`);

      const transcript = await whisper(file_path, {
        modelName: "small.en",
      });

      const full_text = transcript
        .map((segment) => segment.speech)
        .join(" ")
        .trim();

      console.log(`Transcription complete for audio_hash: ${audio_hash}`);

      const message = {
        audio_hash: audio_hash,
        full_text: full_text,
      };

      await this.updateStatus(audio_hash, ProcessingStatus.PENDING_ANALYSIS);
      await queueService.publish(QueueNames.TRANSCRIPT_ANALYZE, message);

      return { status: "transcription_complete", transcript: full_text };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("Error during transcription:", errorMessage);
      await this.updateStatus(
        audio_hash,
        ProcessingStatus.FAILED,
        errorMessage,
      );
      await queueService.publish(QueueNames.AUDIO_FAILED, {
        audio_hash: audio_hash,
        error: errorMessage,
      });
      return { status: "transcription_failed", transcript: "" };
    }
  }
}
