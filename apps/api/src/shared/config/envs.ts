import { z } from "zod";

export const envs = {
  app: loadAppEnvs(),
  db: loadDbEnvs(),
  services: loadServicesEnvs(),
};

function loadAppEnvs() {
  const schema = z.object({
    NODE_ENV: z.enum(["dev", "prod"]).default("dev"),
    PORT: z.coerce.number().default(8080),
    CLIENT_URL: z.url().default("http://localhost:3000"),
  });

  return schema.parse(process.env);
}

function loadDbEnvs() {
  const schema = z.object({
    DATABASE_URL: z.url(),
    RABBITMQ_URL: z.url(),
  });

  return schema.parse(process.env);
}

function loadServicesEnvs() {
  const schema = z.object({
    OLLAMA_API_URL: z.url().default("http://localhost:11434"),
  });

  return schema.parse(process.env);
}
