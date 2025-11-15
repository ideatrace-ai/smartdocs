import { Elysia } from "elysia";
import { openapi } from "@elysiajs/openapi";
import { orchestratorRouter } from "../../modules/gateway/router";
import { envs } from "../config/envs";

const app = new Elysia()
  .use(
    openapi({
      path: "/swagger",
    }),
  )
  .use(orchestratorRouter)
  .listen(envs.app.PORT, ({ port, hostname }) =>
    console.log(`Server running on port http://${hostname}:${port}`),
  );

export type App = typeof app;
