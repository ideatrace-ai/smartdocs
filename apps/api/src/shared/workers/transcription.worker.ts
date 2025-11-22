import { queueService } from "../queue/services/queue.service";
import { db } from "../database";
import { processingStatus } from "../database/schema";
import { ProcessingStatus, QueueNames } from "../utils/constants";
import { nodewhisper } from "nodejs-whisper";
import { envs } from "../config/envs";

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
  ): Promise<{ status: string; transcript: string }> {
    const { audio_hash, file_path } = payload;
    console.log("TranscriptionWorker received:", audio_hash);

    try {
      await this.updateStatus(audio_hash, ProcessingStatus.TRANSCRIBING);

      console.log(`Starting transcription for audio_hash: ${audio_hash}`);

      const transcript = await nodewhisper(file_path, {
        modelName: envs.transcription.TRANSCRIPTION_MODEL,
        autoDownloadModelName: envs.transcription.TRANSCRIPTION_MODEL,
        whisperOptions: {
          outputInText: true,
          language: envs.transcription.TRANSCRIPTION_LANGUAGE,
          translateToEnglish: false,
        },
      });

      const full_text = transcript.trim();

      const cleanedText = full_text
        .replace(
          /\[\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}\]/g,
          "",
        )
        .replace(/\[.*?\]/g, "")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .join("\n");

      console.log(`Transcription complete for audio_hash: ${audio_hash}`);

      const message = {
        audio_hash: audio_hash,
        full_text: cleanedText,
      };

      await this.updateStatus(audio_hash, ProcessingStatus.PENDING_ANALYSIS);
      await queueService.publish(QueueNames.TRANSCRIPT_ANALYZE, message);

      return { status: "transcription_complete", transcript: cleanedText };
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
