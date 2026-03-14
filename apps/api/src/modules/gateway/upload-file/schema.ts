import { t } from "elysia";

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

export const uploadSchema = {
  body: t.Object({
    audio: t.File({ maxSize: MAX_FILE_SIZE }),
    api_key: t.Optional(t.String()),
    provider: t.Optional(t.String()),
  }),
};
