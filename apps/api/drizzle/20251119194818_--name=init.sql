CREATE TABLE "requirement_documents" (
	"audio_hash" text PRIMARY KEY NOT NULL,
	"document_data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processing_status" (
	"audio_hash" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"details" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
