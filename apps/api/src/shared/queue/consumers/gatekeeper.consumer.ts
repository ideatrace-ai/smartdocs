import { queueService } from "../services/queue.service";
import {
  GatekeeperWorker,
  type GatekeeperPayload,
} from "../../workers/gatekeeper.worker";
import { QueueNames } from "../../utils/constants";
import { logger } from "../../utils/logger";

const log = logger.child({ consumer: "gatekeeper" });
const QUEUE_NAME = QueueNames.AUDIO_NEW;

async function main() {
  log.info("Starting gatekeeper consumer");

  const worker = new GatekeeperWorker();

  await queueService.consume(QUEUE_NAME, async (payload) => {
    log.info(`Received message from ${QUEUE_NAME}`);

    if (!isGatekeeperPayload(payload)) {
      log.error("Invalid message payload", { payload });
      return;
    }

    await worker.perform(payload);
  });
}

function isGatekeeperPayload(payload: any): payload is GatekeeperPayload {
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
