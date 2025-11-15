import ffmpeg from "fluent-ffmpeg";
import path from "path";
import { mkdir, readFile } from "fs/promises";
import VAD from "node-webrtcvad";
import { queueService } from "../queue/services/queue.service";
import { whisper } from "@lumen-labs-dev/whisper-node";
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
    const MAX_RETRIES = 3;
    const SAMPLE_DURATION = 30;

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

      let classification: "SOFTWARE" | "OTHER" = "OTHER";
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

        const transcript = await whisper(trimmedAudioPath, {
          modelName: "tiny",
        });
        const transcribedText = transcript
          .map((segment) => segment.speech)
          .join(" ")
          .trim();
        console.log(
          `Lightweight transcript (Attempt ${attempt}): "${transcribedText}"`,
        );

        if (!transcribedText) {
          console.log("Transcription is empty, continuing to next attempt.");
          continue;
        }

        classification = await this.classifyWithOllama(transcribedText);
        console.log(
          `Ollama classification (Attempt ${attempt}): ${classification}`,
        );

        if (classification === "SOFTWARE") {
          break;
        }
      }

      if (classification === "SOFTWARE") {
        console.log("Publishing to q.audio.transcribe");
        await this.updateStatus(
          audio_hash,
          ProcessingStatus.PENDING_TRANSCRIPTION,
        );
        await queueService.publish(QueueNames.AUDIO_TRANSCRIBE, payload);
        return { status: "gatekeeper_success", classification };
      } else {
        const reason = GatekeeperRejectionReason.INVALID_CONTEXT;
        console.log(
          `Publishing to q.audio.failed after max retries with reason: ${reason}`,
        );
        await this.updateStatus(audio_hash, ProcessingStatus.FAILED, reason);
        await queueService.publish(QueueNames.AUDIO_FAILED, {
          audio_hash,
          reason,
        });
        return { status: "gatekeeper_rejected", classification };
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
            model: "phi-3:mini",
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
      const classification = (result as { response: string }).response
        .trim()
        .toUpperCase();

      if (classification === "SOFTWARE") {
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
    const vad = new VAD(16000, 3);
    const frameDuration = 30;
    const bytesPerSample = 2;
    const samplesPerFrame = (16000 / 1000) * frameDuration;
    const frameSize = samplesPerFrame * bytesPerSample;

    const fileBuffer = await readFile(audioPath);
    const audioData = fileBuffer.slice(44);

    let speechFrames = 0;
    let totalFrames = 0;

    for (let i = 0; i < audioData.length; i += frameSize) {
      const frame = audioData.slice(i, i + frameSize);
      if (frame.length === frameSize) {
        totalFrames++;
        if (vad.process(frame)) {
          speechFrames++;
        }
      }
    }

    return totalFrames > 0 ? (speechFrames / totalFrames) * 100 : 0;
  }
}
