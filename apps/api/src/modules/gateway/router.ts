import { Elysia } from "elysia";
import { uploadFileRouter } from "./upload-file/router";
import { getStatusRouter } from "./get-status-execution/router";

export const gatewayRouter = new Elysia({ prefix: "/gateway" })
  .use(uploadFileRouter)
  .use(getStatusRouter);
