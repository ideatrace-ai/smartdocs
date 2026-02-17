import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";

export const processingStatus = pgTable("processing_status", {
  audio_hash: text("audio_hash").primaryKey(),
  status: text("status").notNull(),
  details: text("details"),
  retry_count: integer("retry_count").default(0).notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});
