import { consumeMessages } from "../queue";
import {
  TranscriptionWorker,
  TranscriptionPayload,
} from "../../modules/workers/transcription.worker";

const QUEUE_NAME = "q.audio.transcribe";

async function main() {
  console.log("Starting transcription consumer...");

  const worker = new TranscriptionWorker();

  await consumeMessages(QUEUE_NAME, async (payload) => {
    console.log(`Received message from ${QUEUE_NAME}:`, payload);

    // Basic validation
    if (!isTranscriptionPayload(payload)) {
      console.error("Invalid message payload:", payload);
      // The message will be rejected and not requeued by the consumer logic.
      return;
    }

    await worker.perform(payload);
  });
}

// Type guard to validate the payload
function isTranscriptionPayload(payload: any): payload is TranscriptionPayload {
  return (
    payload &&
    typeof payload.audio_hash === "string" &&
    typeof payload.file_path === "string"
  );
}

main().catch((error) => {
  console.error("Consumer failed to start:", error);
  process.exit(1);
});
