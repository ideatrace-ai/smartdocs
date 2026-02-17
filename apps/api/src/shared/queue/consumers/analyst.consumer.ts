import { queueService } from "../services/queue.service";
import {
  AnalystWorker,
  type AnalystPayload,
} from "../../workers/analyst.worker";
import { QueueNames } from "../../utils/constants";
import { logger } from "../../utils/logger";

const log = logger.child({ consumer: "analyst" });
const QUEUE_NAME = QueueNames.TRANSCRIPT_ANALYZE;

async function main() {
  log.info("Starting analyst consumer");

  const worker = new AnalystWorker();

  await queueService.consume(QUEUE_NAME, async (payload) => {
    log.info(`Received message from ${QUEUE_NAME}`);

    if (!isAnalystPayload(payload)) {
      log.error("Invalid message payload", { payload });
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
  log.error("Consumer failed to start", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
