import { Elysia } from "elysia";
import { uploadFileRouter } from "./upload-file/router";
import { getStatusRouter } from "./get-status-execution/router";
import { downloadFileRouter } from "./download-file/router";

export const gatewayRouter = new Elysia({ prefix: "/gateway" })
  .use(uploadFileRouter)
  .use(getStatusRouter)
  .use(downloadFileRouter);
