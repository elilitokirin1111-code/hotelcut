CREATE TYPE "public"."analysis_job_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."asset_derivative_kind" AS ENUM('proxy', 'thumbnail', 'audio');--> statement-breakpoint
CREATE TYPE "public"."asset_segment_kind" AS ENUM('scene', 'speech', 'vad', 'manual');--> statement-breakpoint
CREATE TYPE "public"."asset_segment_source" AS ENUM('automatic', 'manual');--> statement-breakpoint
CREATE TYPE "public"."asset_upload_status" AS ENUM('initiated', 'completed', 'aborted', 'expired');--> statement-breakpoint
CREATE TABLE "analysis_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"asset_id" uuid NOT NULL,
	"status" "analysis_job_status" DEFAULT 'queued' NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"logs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error_code" varchar(100),
	"error_message" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analysis_jobs_attempt_nonnegative" CHECK ("analysis_jobs"."attempt" >= 0),
	CONSTRAINT "analysis_jobs_max_attempts_range" CHECK ("analysis_jobs"."max_attempts" >= 1 and "analysis_jobs"."max_attempts" <= 10)
);
--> statement-breakpoint
CREATE TABLE "asset_derivatives" (
	"id" uuid PRIMARY KEY NOT NULL,
	"asset_id" uuid NOT NULL,
	"kind" "asset_derivative_kind" NOT NULL,
	"storage_bucket" varchar(120) NOT NULL,
	"storage_key" varchar(500) NOT NULL,
	"content_type" varchar(120) NOT NULL,
	"byte_size" integer NOT NULL,
	"checksum_sha256" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_derivatives_byte_size_positive" CHECK ("asset_derivatives"."byte_size" > 0)
);
--> statement-breakpoint
CREATE TABLE "asset_uploads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"asset_id" uuid NOT NULL,
	"provider_upload_id" text NOT NULL,
	"part_size" integer NOT NULL,
	"part_count" integer NOT NULL,
	"status" "asset_upload_status" DEFAULT 'initiated' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_uploads_part_size_minimum" CHECK ("asset_uploads"."part_size" >= 5242880),
	CONSTRAINT "asset_uploads_part_count_range" CHECK ("asset_uploads"."part_count" >= 1 and "asset_uploads"."part_count" <= 10000)
);
--> statement-breakpoint
ALTER TABLE "asset_segments" ADD COLUMN "kind" "asset_segment_kind" DEFAULT 'scene' NOT NULL;--> statement-breakpoint
ALTER TABLE "asset_segments" ADD COLUMN "source" "asset_segment_source" DEFAULT 'automatic' NOT NULL;--> statement-breakpoint
ALTER TABLE "asset_segments" ADD COLUMN "created_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "analysis_jobs" ADD CONSTRAINT "analysis_jobs_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_derivatives" ADD CONSTRAINT "asset_derivatives_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_uploads" ADD CONSTRAINT "asset_uploads_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analysis_jobs_asset_idx" ON "analysis_jobs" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "analysis_jobs_status_idx" ON "analysis_jobs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_derivatives_asset_kind_unique" ON "asset_derivatives" USING btree ("asset_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_derivatives_storage_location_unique" ON "asset_derivatives" USING btree ("storage_bucket","storage_key");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_uploads_asset_unique" ON "asset_uploads" USING btree ("asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_uploads_provider_unique" ON "asset_uploads" USING btree ("provider_upload_id");--> statement-breakpoint
ALTER TABLE "asset_segments" ADD CONSTRAINT "asset_segments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;