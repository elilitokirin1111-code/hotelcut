ALTER TYPE "public"."render_artifact_kind" ADD VALUE 'project';--> statement-breakpoint
ALTER TYPE "public"."render_artifact_kind" ADD VALUE 'manifest';--> statement-breakpoint
ALTER TABLE "render_jobs" ADD COLUMN "max_attempts" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "render_jobs" ADD COLUMN "progress_basis_points" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "render_jobs" ADD COLUMN "input_hash" varchar(64) DEFAULT repeat('0', 64) NOT NULL;--> statement-breakpoint
ALTER TABLE "render_jobs" ALTER COLUMN "input_hash" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "render_jobs" ADD COLUMN "logs" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "render_jobs" ADD COLUMN "cancel_requested_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "render_artifacts_job_kind_unique" ON "render_artifacts" USING btree ("render_job_id","kind");--> statement-breakpoint
ALTER TABLE "render_jobs" ADD CONSTRAINT "render_jobs_max_attempts_range" CHECK ("render_jobs"."max_attempts" >= 1 and "render_jobs"."max_attempts" <= 10);--> statement-breakpoint
ALTER TABLE "render_jobs" ADD CONSTRAINT "render_jobs_progress_range" CHECK ("render_jobs"."progress_basis_points" >= 0 and "render_jobs"."progress_basis_points" <= 10000);--> statement-breakpoint
ALTER TABLE "render_jobs" ADD CONSTRAINT "render_jobs_input_hash_format" CHECK ("render_jobs"."input_hash" ~ '^[0-9a-fA-F]{64}$');
