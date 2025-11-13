import { whisper } from "@lumen-labs-dev/whisper-node";
import { publishMessage } from "../../shared/queue";

export interface TranscriptionPayload {
  audio_hash: string;
  file_path: string;
}

export class TranscriptionWorker {
  async perform(payload: TranscriptionPayload): Promise<{ status: string; transcript: string; }> {
    console.log("TranscriptionWorker received:", payload);

    try {
      console.log(`Starting transcription for audio_hash: ${payload.audio_hash}`);
      
      const transcript = await whisper(payload.file_path, {
        modelName: "small.en",
      });

      const full_text = transcript.map(segment => segment.speech).join(" ").trim();

      console.log(`Transcription complete for audio_hash: ${payload.audio_hash}`);

      const message = {
        audio_hash: payload.audio_hash,
        full_text: full_text,
      };

      await publishMessage("q.transcript.analyze", message);

      return { status: "transcription_complete", transcript: full_text };

    } catch (error) {
      console.error("Error during transcription:", error);
      await publishMessage("q.audio.failed", {
        audio_hash: payload.audio_hash,
        error: error instanceof Error ? error.message : String(error),
      });
      return { status: "transcription_failed", transcript: "" };
    }
  }
}
