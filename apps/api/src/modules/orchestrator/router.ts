import { Elysia } from "elysia";
import { uploadSchema } from "./schema";
import { handleAudioUpload } from "./use-case";

export const orchestratorRouter = new Elysia({ prefix: "/orchestrator" }).post(
  "/upload",
  async ({ body, set }) => {
    const result = await handleAudioUpload(body.audio);
    if (result.isCached) {
      return result.data;
    }
    set.status = 202;
    return result.data;
  },
  uploadSchema,
);
