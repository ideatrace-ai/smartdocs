import { queueService } from "../services/queue.service";
import {
  AnalystWorker,
  type AnalystPayload,
} from "../../workers/analyst.worker";
import { QueueNames } from "../../utils/constants";

const QUEUE_NAME = QueueNames.TRANSCRIPT_ANALYZE;

async function main() {
  console.log("Starting analyst consumer...");

  const worker = new AnalystWorker();

  await queueService.consume(QUEUE_NAME, async (payload) => {
    console.log(`Received message from ${QUEUE_NAME}:`, payload);

    if (!isAnalystPayload(payload)) {
      console.error("Invalid message payload:", payload);
      return;
    }

    await worker.perform(payload);
  });
}

function isAnalystPayload(payload: any): payload is AnalystPayload {
  return (
    payload &&
    typeof payload.audio_hash === "string" &&
    typeof payload.full_text === "string"
  );
}

main().catch((error) => {
  console.error("Consumer failed to start:", error);
  process.exit(1);
});
