import { t } from "elysia";

export const uploadSchema = {
  body: t.Object({
    audio: t.File(),
  }),
};
