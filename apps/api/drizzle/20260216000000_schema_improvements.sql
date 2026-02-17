ALTER TABLE "processing_status" ADD COLUMN "retry_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "processing_status" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "requirement_documents" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;
