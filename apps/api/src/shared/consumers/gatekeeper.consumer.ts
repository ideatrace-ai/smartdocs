import { consumeMessages } from "../queue";
import {
  GatekeeperWorker,
  GatekeeperPayload,
} from "../../modules/workers/gatekeeper.worker";

const QUEUE_NAME = "q.audio.new";

async function main() {
  console.log("Starting gatekeeper consumer...");

  const worker = new GatekeeperWorker();

  await consumeMessages(QUEUE_NAME, async (payload) => {
    console.log(`Received message from ${QUEUE_NAME}:`, payload);

    if (!isGatekeeperPayload(payload)) {
      console.error("Invalid message payload:", payload);
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
  console.error("Consumer failed to start:", error);
  process.exit(1);
});
