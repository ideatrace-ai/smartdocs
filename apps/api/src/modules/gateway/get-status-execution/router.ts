import { Elysia } from "elysia";
import { getStatusSchema } from "./schema";
import { getProcessingStatus } from "./use-case";

export const getStatusRouter = new Elysia().get(
  "/status/:audio_hash",
  async ({ params, set }) => {
    const status = await getProcessingStatus(params.audio_hash);

    if (!status) {
      set.status = 404;
      return {
        error: "Not Found",
        message: `No status found for audio_hash: ${params.audio_hash}`,
      };
    }

    return status;
  },
  getStatusSchema,
);
