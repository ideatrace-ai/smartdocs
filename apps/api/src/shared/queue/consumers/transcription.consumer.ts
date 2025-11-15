import { queueService } from "../services/queue.service";
import {
  TranscriptionWorker,
  type TranscriptionPayload,
} from "../workers/transcription.worker";
import { QueueNames } from "../../constants";

const QUEUE_NAME = QueueNames.AUDIO_TRANSCRIBE;

async function main() {
  console.log("Starting transcription consumer...");

  const worker = new TranscriptionWorker();

  await queueService.consume(QUEUE_NAME, async (payload) => {
    console.log(`Received message from ${QUEUE_NAME}:`, payload);

    if (!isTranscriptionPayload(payload)) {
      console.error("Invalid message payload:", payload);
      return;
    }

    await worker.perform(payload);
  });
}

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
