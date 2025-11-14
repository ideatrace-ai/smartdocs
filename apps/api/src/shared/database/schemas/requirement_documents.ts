import { pgTable, text, jsonb } from "drizzle-orm/pg-core";

export const requirementDocuments = pgTable("requirement_documents", {
  audio_hash: text("audio_hash").primaryKey(),
  document_data: jsonb("document_data").notNull(),
});
