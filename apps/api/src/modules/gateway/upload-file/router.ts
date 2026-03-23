import { Elysia } from "elysia";
import { handleAudioUpload } from "./use-case";

export const uploadFileRouter = new Elysia().post(
  "/upload",
  async ({ request, status }) => {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return status(400, { error: "Expected multipart/form-data" });
    }

    const result = await handleAudioUpload(request);
    if (result.isCached) {
      return result.data;
    }
    return status(200, result.data);
  },
  { parse: "none" },
);
