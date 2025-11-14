import { t } from "elysia";

export const getStatusSchema = {
  params: t.Object({
    audio_hash: t.String(),
  }),
};
