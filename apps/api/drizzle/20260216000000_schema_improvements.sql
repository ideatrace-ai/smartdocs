ALTER TABLE "processing_status" ADD COLUMN IF NOT EXISTS "retry_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "processing_status" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "requirement_documents" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now() NOT NULL;
