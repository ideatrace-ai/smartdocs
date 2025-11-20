import { Elysia } from "elysia";
import { openapi } from "@elysiajs/openapi";
import { cors } from "@elysiajs/cors";
import { gatewayRouter } from "../../modules/gateway/router";
import { envs } from "../config/envs";

const app = new Elysia()
  .use(cors())
  .use(
    openapi({
      path: "/swagger",
    }),
  )
  .use(gatewayRouter)
  .listen(envs.app.PORT, ({ port, hostname }) =>
    console.log(`Server running on port http://${hostname}:${port}`),
  );

export type App = typeof app;
