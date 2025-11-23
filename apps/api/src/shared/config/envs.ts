import { z } from "zod";

export const envs = {
  app: loadAppEnvs(),
  db: loadDbEnvs(),
  services: loadServicesEnvs(),
  transcription: loadTranscriptionEnvs(),
  analytics: loadAnalyticsEnvs(),
  gatekeeper: loadGatekeeperEnvs(),
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

function loadTranscriptionEnvs() {
  const schema = z.object({
    TRANSCRIPTION_MODEL: z.string(),
    TRANSCRIPTION_LANGUAGE: z.string(),
  });

  return schema.parse(process.env);
}

function loadAnalyticsEnvs() {
  const schema = z.object({
    ANALYTICS_MODEL: z.string(),
  });

  return schema.parse(process.env);
}

function loadGatekeeperEnvs() {
  const schema = z.object({
    GATEKEEPER_TRANSCRIPTION_MODEL: z.string(),
    GATEKEEPER_ANALYTICS_MODEL: z.string(),
    TRANSCRIPTION_LANGUAGE: z.string(),
    MAX_RETRIES: z.coerce.number().default(3),
    SAMPLE_DURATION: z.coerce.number().default(30),
  });

  return schema.parse(process.env);
}
