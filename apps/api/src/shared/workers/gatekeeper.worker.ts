import ffmpeg from "fluent-ffmpeg";
import path from "path";
import { nodewhisper } from "nodejs-whisper";

ffmpeg.setFfmpegPath("ffmpeg");
ffmpeg.setFfprobePath("ffprobe");

import { mkdir } from "fs/promises";
import { queueService } from "../queue/services/queue.service";
import { gatekeeperPrompt } from "./prompts/gatekeeper-prompt";
import { db } from "../database";
import { processingStatus } from "../database/schema";
import { envs } from "../config/envs";
import {
  ProcessingStatus,
  GatekeeperRejectionReason,
  QueueNames,
} from "../utils/constants";

export interface GatekeeperPayload {
  audio_hash: string;
  file_path: string;
}

export class GatekeeperWorker {
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

  async perform(payload: GatekeeperPayload) {
    console.log("GatekeeperWorker received:", payload);
    const { audio_hash, file_path } = payload;
    const MAX_RETRIES = envs.gatekeeper.MAX_RETRIES;
    const SAMPLE_DURATION = envs.gatekeeper.SAMPLE_DURATION;

    try {
      await this.updateStatus(audio_hash, ProcessingStatus.VALIDATING);

      const tempDir = path.join(process.cwd(), "data", "temp");
      await mkdir(tempDir, { recursive: true });

      const vadAudioPath = path.join(tempDir, `${audio_hash}_vad.wav`);
      await this.convertAudioForVAD(file_path, vadAudioPath);
      const speechPercentage = await this.performVAD(vadAudioPath);
      console.log(`Speech percentage: ${speechPercentage.toFixed(2)}%`);

      if (speechPercentage < 10) {
        const reason = GatekeeperRejectionReason.NO_SPEECH;
        console.log(`Audio rejected due to low speech percentage.`);
        await this.updateStatus(audio_hash, ProcessingStatus.FAILED, reason);
        await queueService.publish(QueueNames.AUDIO_FAILED, {
          audio_hash,
          reason,
        });
        return { status: "gatekeeper_rejected", reason };
      }

      const duration = await this.getAudioDuration(file_path);
      if (duration < SAMPLE_DURATION) {
        const reason = GatekeeperRejectionReason.AUDIO_TOO_SHORT;
        console.log(
          "Audio rejected because it's shorter than the sample duration.",
        );
        await this.updateStatus(audio_hash, ProcessingStatus.FAILED, reason);
        await queueService.publish(QueueNames.AUDIO_FAILED, {
          audio_hash,
          reason,
        });
        return { status: "gatekeeper_rejected", reason };
      }

      // --- INÍCIO DA NOVA LÓGICA DE RETRY/VOTAÇÃO ---

      const attemptsHistory: string[] = [];

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        console.log(`Attempt ${attempt} of ${MAX_RETRIES}...`);

        const maxStartTime = duration - SAMPLE_DURATION;
        const startTime = Math.random() * maxStartTime;
        const trimmedAudioPath = path.join(
          tempDir,
          `${audio_hash}_trimmed_attempt_${attempt}.wav`,
        );

        await this.trimAudio(
          file_path,
          trimmedAudioPath,
          startTime,
          SAMPLE_DURATION,
        );
        console.log(
          `Audio trimmed from ${startTime.toFixed(2)}s and saved to: ${trimmedAudioPath}`,
        );

        let transcribedText = "";
        try {
          transcribedText = await nodewhisper(trimmedAudioPath, {
            modelName: envs.gatekeeper.TRANSCRIPTION_MODEL,
            autoDownloadModelName: envs.gatekeeper.TRANSCRIPTION_MODEL,
            whisperOptions: {
              outputInText: true,
              language: envs.gatekeeper.TRANSCRIPTION_LANGUAGE,
              translateToEnglish: false,
            },
          });
          transcribedText = transcribedText.trim();
          transcribedText = transcribedText
            .replace(
              /\[\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}\]/g,
              "",
            )
            .trim();
          transcribedText = transcribedText.replace(/\[.*?\]/g, "").trim();
        } catch (error) {
          console.warn("Whisper execution failed:", error);
          continue;
        }

        console.log(
          `Lightweight transcript (Attempt ${attempt}): "${transcribedText}"`,
        );

        if (!transcribedText) {
          console.log("Transcription is empty, continuing to next attempt.");
          continue;
        }

        const classification = await this.classifyWithOllama(transcribedText);
        console.log(
          `Ollama classification (Attempt ${attempt}): ${classification}`,
        );

        attemptsHistory.push(classification);

        if (!envs.gatekeeper.RETRY_ALWAYS && classification === "SOFTWARE") {
          console.log("Software detected in fast mode. Breaking loop.");
          break;
        }
      }

      let finalVerdict = "";
      const softwareCount = attemptsHistory.filter(
        (c) => c === "SOFTWARE",
      ).length;
      const totalValidAttempts = attemptsHistory.length;

      if (envs.gatekeeper.RETRY_ALWAYS) {
        const otherCount = totalValidAttempts - softwareCount;
        console.log(
          `Decision Mode: VOTING. Score: SOFTWARE (${softwareCount}) vs OTHERS (${otherCount})`,
        );

        if (softwareCount > otherCount) {
          finalVerdict = "SOFTWARE";
        } else {
          finalVerdict = "OTHER";
        }
      } else {
        finalVerdict = softwareCount > 0 ? "SOFTWARE" : "OTHER";
      }

      if (finalVerdict === "SOFTWARE") {
        console.log("Publishing to q.audio.transcribe");
        await this.updateStatus(
          audio_hash,
          ProcessingStatus.PENDING_TRANSCRIPTION,
        );
        await queueService.publish(QueueNames.AUDIO_TRANSCRIBE, payload);
        return { status: "gatekeeper_success", classification: finalVerdict };
      } else {
        const reason = GatekeeperRejectionReason.INVALID_CONTEXT;
        console.log(
          `Publishing to q.audio.failed after analysis (Verdict: ${finalVerdict}). History: [${attemptsHistory.join(", ")}]`,
        );
        await this.updateStatus(audio_hash, ProcessingStatus.FAILED, reason);
        await queueService.publish(QueueNames.AUDIO_FAILED, {
          audio_hash,
          reason,
        });
        return { status: "gatekeeper_rejected", classification: finalVerdict };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("Error in GatekeeperWorker:", errorMessage);
      await this.updateStatus(
        audio_hash,
        ProcessingStatus.FAILED,
        errorMessage,
      );
      await queueService.publish(QueueNames.AUDIO_FAILED, {
        audio_hash,
        error: errorMessage,
      });
      return { status: "gatekeeper_failed" };
    }
  }

  private async classifyWithOllama(
    text: string,
  ): Promise<"SOFTWARE" | "OTHER"> {
    try {
      const response = await fetch(
        `${envs.services.OLLAMA_API_URL}/api/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: envs.gatekeeper.ANALYTICS_MODEL,
            prompt: gatekeeperPrompt(text),
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
      const rawResponse = (result as { response: string }).response.trim();
      console.log(`Ollama raw response: "${rawResponse}"`);

      const classification = rawResponse.toUpperCase();

      if (classification.includes("SOFTWARE")) {
        return "SOFTWARE";
      }
      return "OTHER";
    } catch (error) {
      console.error("Error classifying with Ollama:", error);
      return "OTHER";
    }
  }

  private convertAudioForVAD(
    inputPath: string,
    outputPath: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .toFormat("wav")
        .audioCodec("pcm_s16le")
        .audioChannels(1)
        .audioFrequency(16000)
        .on("error", (err) => {
          console.error("ffmpeg error:", err);
          reject(err);
        })
        .on("end", () => {
          resolve();
        })
        .save(outputPath);
    });
  }

  private getAudioDuration(inputPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (err, metadata) => {
        if (err) {
          console.error("ffprobe error:", err);
          reject(err);
          return;
        }
        resolve(metadata.format.duration || 0);
      });
    });
  }

  private trimAudio(
    inputPath: string,
    outputPath: string,
    startTime: number,
    duration: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .setStartTime(startTime)
        .setDuration(duration)
        .on("error", (err) => {
          console.error("ffmpeg error:", err);
          reject(err);
        })
        .on("end", () => {
          resolve();
        })
        .save(outputPath);
    });
  }

  private async performVAD(audioPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      let silenceDuration = 0;

      ffmpeg(audioPath)
        .audioFilters("silencedetect=noise=-30dB:d=0.5")
        .format("null")
        .on("stderr", (line: string) => {
          if (line.includes("silence_duration")) {
            const match = line.match(/silence_duration: (\d+(\.\d+)?)/);
            if (match && match[1]) {
              silenceDuration += parseFloat(match[1]);
            }
          }
        })
        .on("error", (err) => {
          console.error("ffmpeg VAD error:", err);
          reject(err);
        })
        .on("end", async () => {
          try {
            const totalDuration = await this.getAudioDuration(audioPath);
            if (totalDuration === 0) {
              resolve(0);
              return;
            }

            const speechDuration = Math.max(0, totalDuration - silenceDuration);
            const speechPercentage = (speechDuration / totalDuration) * 100;

            resolve(speechPercentage);
          } catch (err) {
            reject(err);
          }
        })
        .save("/dev/null");
    });
  }
}
