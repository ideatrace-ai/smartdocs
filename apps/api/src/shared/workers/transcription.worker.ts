import { queueService } from "../queue/services/queue.service";
import { ProcessingStatus, QueueNames } from "../utils/constants";
import { nodewhisper } from "nodejs-whisper";
import { envs } from "../config/envs";
import { updateStatus } from "../utils/update-status";
import { logger } from "../utils/logger";
import { aiTranscription } from "../services/ai.service";

export interface TranscriptionPayload {
  audio_hash: string;
  file_path: string;
  api_key?: string;
  provider?: "gemini" | "openai" | "anthropic" | "openrouter" | "ollama";
  transcription_model?: string;
}

export class TranscriptionWorker {
  async perform(
    payload: TranscriptionPayload,
  ): Promise<{ status: string; transcript: string }> {
    const { audio_hash, file_path, api_key, provider, transcription_model } = payload;
    const log = logger.child({ worker: "transcription", audio_hash });
    log.info("Received payload");

    try {
      await updateStatus(audio_hash, ProcessingStatus.TRANSCRIBING);

      log.info("Starting transcription", { provider });

      let full_text = "";

      if (provider === "openai") {
        const transcript = await aiTranscription({
          filePath: file_path,
          apiKey: api_key,
          model: transcription_model || "whisper-1",
        });

        if (!transcript) {
          throw new Error("Cloud transcription failed to return text");
        }
        full_text = transcript;
      } else {
        const transcript = await nodewhisper(file_path, {
          modelName: envs.transcription.TRANSCRIPTION_MODEL,
          autoDownloadModelName: envs.transcription.TRANSCRIPTION_MODEL,
          whisperOptions: {
            outputInText: true,
            language: envs.transcription.TRANSCRIPTION_LANGUAGE,
            translateToEnglish: false,
          },
        });
        full_text = transcript;
      }

      const cleanedText = full_text
        .trim()
        .replace(
          /\[\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}\]/g,
          "",
        )
        .replace(/\[.*?\]/g, "")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .join("\n");

      log.info("Transcription complete", {
        length: cleanedText.length,
        method: provider === "openai" ? "cloud" : "local"
      });

      const message = {
        audio_hash: audio_hash,
        full_text: cleanedText,
        api_key: api_key,
        provider: provider,
      };


      await updateStatus(audio_hash, ProcessingStatus.PENDING_ANALYSIS);
      await queueService.publish(QueueNames.TRANSCRIPT_ANALYZE, message);

      return { status: "transcription_complete", transcript: cleanedText };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      log.error("Transcription failed", { error: errorMessage });
      await updateStatus(
        audio_hash,
        ProcessingStatus.FAILED,
        `Transcription failed: ${errorMessage}`,
      );
      await queueService.publish(QueueNames.AUDIO_FAILED, {
        audio_hash: audio_hash,
        error: errorMessage,
      });
      return { status: "transcription_failed", transcript: "" };
    }
  }
}
