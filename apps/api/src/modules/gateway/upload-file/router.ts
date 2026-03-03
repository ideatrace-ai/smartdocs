import { Elysia } from "elysia";
import { uploadSchema } from "./schema";
import { handleAudioUpload } from "./use-case";

export const uploadFileRouter = new Elysia().post(
  "/upload",
  async ({ body, status }) => {
    const result = await handleAudioUpload(
      body.audio,
      body.api_key,
      body.provider,
    );
    if (result.isCached) {
      return result.data;
    }
    return status(200, result.data);
  },
  uploadSchema,
);
