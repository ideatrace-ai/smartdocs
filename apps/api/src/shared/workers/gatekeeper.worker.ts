import ffmpeg from "fluent-ffmpeg";
import path from "path";
import { nodewhisper } from "nodejs-whisper";

ffmpeg.setFfmpegPath("ffmpeg");
ffmpeg.setFfprobePath("ffprobe");

import { mkdir } from "fs/promises";
import { queueService } from "../queue/services/queue.service";
import { gatekeeperPrompt } from "./prompts/gatekeeper-prompt";
import { envs } from "../config/envs";
import {
  ProcessingStatus,
  GatekeeperRejectionReason,
  QueueNames,
} from "../utils/constants";
import { updateStatus } from "../utils/update-status";
import { aiGenerate } from "../services/ai.service";
import { cleanupFiles } from "../utils/temp-files";
import { logger } from "../utils/logger";

export interface GatekeeperPayload {
  audio_hash: string;
  file_path: string;
  api_key?: string;
  provider?: "gemini" | "openai" | "anthropic" | "openrouter" | "ollama";
}

export class GatekeeperWorker {
  async perform(payload: GatekeeperPayload) {
    const { audio_hash, file_path, api_key, provider } = payload;
    const log = logger.child({ worker: "gatekeeper", audio_hash });
    log.info("Received payload");
    const MAX_RETRIES = envs.gatekeeper.MAX_RETRIES;
    const SAMPLE_DURATION = envs.gatekeeper.SAMPLE_DURATION;
    const tempFiles: string[] = [];

    try {
      await updateStatus(audio_hash, ProcessingStatus.VALIDATING);

      const tempDir = path.join(process.cwd(), "data", "temp");
      await mkdir(tempDir, { recursive: true });

      const vadAudioPath = path.join(tempDir, `${audio_hash}_vad.wav`);
      tempFiles.push(vadAudioPath);

      await this.convertAudioForVAD(file_path, vadAudioPath);
      const speechPercentage = await this.performVAD(vadAudioPath);
      log.info(`Speech percentage: ${speechPercentage.toFixed(2)}%`);

      if (speechPercentage < 10) {
        const reason = GatekeeperRejectionReason.NO_SPEECH;
        log.warn("Audio rejected due to low speech percentage");
        await updateStatus(audio_hash, ProcessingStatus.FAILED, reason);
        await queueService.publish(QueueNames.AUDIO_FAILED, {
          audio_hash,
          reason,
        });
        return { status: "gatekeeper_rejected", reason };
      }

      const duration = await this.getAudioDuration(file_path);
      if (duration < SAMPLE_DURATION) {
        const reason = GatekeeperRejectionReason.AUDIO_TOO_SHORT;
        log.warn("Audio rejected: shorter than sample duration");
        await updateStatus(audio_hash, ProcessingStatus.FAILED, reason);
        await queueService.publish(QueueNames.AUDIO_FAILED, {
          audio_hash,
          reason,
        });
        return { status: "gatekeeper_rejected", reason };
      }

      const attemptsHistory: string[] = [];
      let softwareDetected = false;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        log.info(`Classification attempt ${attempt}/${MAX_RETRIES}`);

        const maxStartTime = duration - SAMPLE_DURATION;
        const startTime = Math.random() * maxStartTime;
        const trimmedAudioPath = path.join(
          tempDir,
          `${audio_hash}_trimmed_attempt_${attempt}.wav`,
        );
        tempFiles.push(trimmedAudioPath);

        await this.trimAudio(
          file_path,
          trimmedAudioPath,
          startTime,
          SAMPLE_DURATION,
        );
        log.debug(`Audio trimmed from ${startTime.toFixed(2)}s`);

        let transcribedText = "";
        try {
          transcribedText = await nodewhisper(trimmedAudioPath, {
            modelName: envs.gatekeeper.GATEKEEPER_TRANSCRIPTION_MODEL,
            autoDownloadModelName:
              envs.gatekeeper.GATEKEEPER_TRANSCRIPTION_MODEL,
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
          log.warn("Whisper execution failed", {
            error: error instanceof Error ? error.message : String(error),
          });
          continue;
        }

        log.debug(`Transcript (attempt ${attempt}): "${transcribedText.substring(0, 100)}..."`);

        if (!transcribedText) {
          log.info("Transcription is empty, continuing to next attempt");
          continue;
        }

        const classification = await this.classifyWithAI(
          transcribedText,
          api_key,
          provider,
        );

        log.info(`Classification result: ${classification}`, { attempt });

        attemptsHistory.push(classification);

        if (classification === "SOFTWARE") {
          log.info("Software context detected, proceeding to transcription");
          softwareDetected = true;
          break;
        }
      }

      if (softwareDetected) {
        log.info("Publishing to transcription queue");
        await updateStatus(
          audio_hash,
          ProcessingStatus.PENDING_TRANSCRIPTION,
        );
        await queueService.publish(QueueNames.AUDIO_TRANSCRIBE, {
          ...payload,
          api_key,
          provider,
        });
        return { status: "gatekeeper_success", classification: "SOFTWARE" };
      } else {
        const reason = GatekeeperRejectionReason.INVALID_CONTEXT;
        log.warn("Audio rejected after analysis", {
          history: attemptsHistory,
        });
        await updateStatus(audio_hash, ProcessingStatus.FAILED, reason);
        await queueService.publish(QueueNames.AUDIO_FAILED, {
          audio_hash,
          reason,
        });
        return { status: "gatekeeper_rejected", classification: "OTHER" };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      log.error("Worker failed", { error: errorMessage });
      await updateStatus(
        audio_hash,
        ProcessingStatus.FAILED,
        errorMessage,
      );
      await queueService.publish(QueueNames.AUDIO_FAILED, {
        audio_hash,
        error: errorMessage,
      });
      return { status: "gatekeeper_failed" };
    } finally {
      await cleanupFiles(tempFiles);
    }
  }

  private async classifyWithAI(
    text: string,
    apiKey?: string,
    provider?: string,
  ): Promise<"SOFTWARE" | "OTHER"> {
    const result = await aiGenerate({
      model: envs.gatekeeper.GATEKEEPER_ANALYTICS_MODEL,
      prompt: gatekeeperPrompt(text),
      timeoutMs: 30_000,
      maxRetries: 2,
      apiKey,
      provider,
    });

    if (!result) {
      logger.error("Classification returned no result");
      return "OTHER";
    }

    const classification = result.trim().toUpperCase();
    logger.debug(`Classification raw response: "${result.trim()}"`);

    if (classification.includes("SOFTWARE")) {
      return "SOFTWARE";
    }
    return "OTHER";
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
        .on("error", (err) => reject(err))
        .on("end", () => resolve())
        .save(outputPath);
    });
  }

  private getAudioDuration(inputPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (err, metadata) => {
        if (err) {
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
        .on("error", (err) => reject(err))
        .on("end", () => resolve())
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
        .on("error", (err) => reject(err))
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
