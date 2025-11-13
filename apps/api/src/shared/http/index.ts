import { Elysia } from "elysia";
import { openapi } from "@elysiajs/openapi";
import { envs } from "../../config/envs";
import { orchestratorRouter } from "../../modules/orchestrator/router";

const app = new Elysia()
  .use(
    openapi({
      path: "/swagger",
    })
  )
  .use(orchestratorRouter)
  .listen(envs.app.PORT, ({ port, hostname }) =>
    console.log(`Server running on port http://${hostname}:${port}`)
  );

export type App = typeof app;