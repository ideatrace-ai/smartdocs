import { Elysia } from "elysia";
import { uploadFileRouter } from "./upload-file/router";
import { getStatusRouter } from "./get-status-execution/router";

export const orchestratorRouter = new Elysia({ prefix: "/orchestrator" })
  .use(uploadFileRouter)
  .use(getStatusRouter);