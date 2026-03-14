import { Elysia } from "elysia";
import { openapi } from "@elysiajs/openapi";
import { cors } from "@elysiajs/cors";
import { gatewayRouter } from "../../modules/gateway/router";
import { envs } from "../config/envs";
import { logger } from "../utils/logger";

const app = new Elysia({
  serve: {
    maxRequestBodySize: 1024 * 1024 * 500, // 500MB
  },
})
  .use(cors())
  .use(
    openapi({
      path: "/swagger",
    }),
  )
  .use(gatewayRouter)
  .listen(envs.app.PORT, ({ port, hostname }) =>
    logger.info(`Server running on http://${hostname}:${port}`),
  );

export type App = typeof app;
