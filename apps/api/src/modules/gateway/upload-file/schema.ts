import { t } from "elysia";

const MAX_FILE_SIZE = 250 * 1024 * 1024; // 250MB

export const uploadSchema = {
  body: t.Object({
    audio: t.File({ maxSize: MAX_FILE_SIZE }),
  }),
};