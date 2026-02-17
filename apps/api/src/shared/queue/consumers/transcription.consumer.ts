import { queueService } from "../services/queue.service";
import {
  TranscriptionWorker,
  type TranscriptionPayload,
} from "../../workers/transcription.worker";
import { QueueNames } from "../../utils/constants";
import { logger } from "../../utils/logger";

const log = logger.child({ consumer: "transcription" });
const QUEUE_NAME = QueueNames.AUDIO_TRANSCRIBE;

async function main() {
  log.info("Starting transcription consumer");

  const worker = new TranscriptionWorker();

  await queueService.consume(QUEUE_NAME, async (payload) => {
    log.info(`Received message from ${QUEUE_NAME}`);

    if (!isTranscriptionPayload(payload)) {
      log.error("Invalid message payload", { payload });
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
  log.error("Consumer failed to start", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
