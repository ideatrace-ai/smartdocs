import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const processingStatus = pgTable("processing_status", {
  audio_hash: text("audio_hash").primaryKey(),
  status: text("status").notNull(),
  details: text("details"),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});
