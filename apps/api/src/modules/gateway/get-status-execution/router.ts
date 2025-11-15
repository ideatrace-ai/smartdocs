import { Elysia } from "elysia";
import { getStatusSchema } from "./schema";
import { getProcessingStatus } from "./use-case";

export const getStatusRouter = new Elysia().get(
  "/status/:audio_hash",
  async ({ params, status }) => {
    const statusProcess = await getProcessingStatus(params.audio_hash);

    if (!statusProcess) {
      const body = {
        error: "Not Found",
        message: `No status found for audio_hash: ${params.audio_hash}`,
      };
      return status(404, body);
    }

    return statusProcess;
  },
  getStatusSchema,
);
