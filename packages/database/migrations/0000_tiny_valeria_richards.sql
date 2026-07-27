CREATE TYPE "public"."asset_kind" AS ENUM('video', 'image', 'audio', 'logo', 'font');--> statement-breakpoint
CREATE TYPE "public"."asset_status" AS ENUM('registered', 'uploaded', 'analyzing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."quality_report_status" AS ENUM('passed', 'warning', 'failed');--> statement-breakpoint
CREATE TYPE "public"."render_artifact_kind" AS ENUM('video', 'thumbnail', 'captions', 'report');--> statement-breakpoint
CREATE TYPE "public"."render_job_status" AS ENUM('queued', 'preprocessing', 'rendering', 'validating', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."video_platform" AS ENUM('douyin', 'xiaohongshu', 'wechat_channels', 'other');--> statement-breakpoint
CREATE TYPE "public"."video_project_status" AS ENUM('draft', 'rendering', 'completed', 'archived');--> statement-breakpoint
CREATE TABLE "asset_segments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"asset_id" uuid NOT NULL,
	"start_ms" integer NOT NULL,
	"end_ms" integer NOT NULL,
	"label" varchar(160),
	"score_basis_points" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_segments_start_nonnegative" CHECK ("asset_segments"."start_ms" >= 0),
	CONSTRAINT "asset_segments_end_after_start" CHECK ("asset_segments"."end_ms" > "asset_segments"."start_ms"),
	CONSTRAINT "asset_segments_score_range" CHECK ("asset_segments"."score_basis_points" is null or ("asset_segments"."score_basis_points" >= 0 and "asset_segments"."score_basis_points" <= 10000))
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"hotel_id" uuid NOT NULL,
	"kind" "asset_kind" NOT NULL,
	"status" "asset_status" DEFAULT 'registered' NOT NULL,
	"original_filename" varchar(260) NOT NULL,
	"content_type" varchar(120) NOT NULL,
	"byte_size" integer NOT NULL,
	"storage_bucket" varchar(120) NOT NULL,
	"storage_key" varchar(500) NOT NULL,
	"checksum_sha256" varchar(64),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_byte_size_positive" CHECK ("assets"."byte_size" > 0)
);
--> statement-breakpoint
CREATE TABLE "brand_kits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"hotel_id" uuid NOT NULL,
	"primary_color" varchar(7) NOT NULL,
	"secondary_color" varchar(7) NOT NULL,
	"accent_color" varchar(7) NOT NULL,
	"font_family" varchar(120) NOT NULL,
	"subtitle_style" varchar(80) NOT NULL,
	"ending_text" varchar(300) NOT NULL,
	"contact_text" varchar(200),
	"logo_asset_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hotels" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"city" varchar(100) NOT NULL,
	"address" varchar(300),
	"timezone" varchar(80) DEFAULT 'Asia/Shanghai' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "membership_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"slug" varchar(80) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"video_project_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"schema_version" varchar(30) NOT NULL,
	"project_document" jsonb NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_revisions_revision_positive" CHECK ("project_revisions"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "quality_reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"render_job_id" uuid NOT NULL,
	"status" "quality_report_status" NOT NULL,
	"score_basis_points" integer NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quality_reports_score_range" CHECK ("quality_reports"."score_basis_points" >= 0 and "quality_reports"."score_basis_points" <= 10000)
);
--> statement-breakpoint
CREATE TABLE "render_artifacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"render_job_id" uuid NOT NULL,
	"kind" "render_artifact_kind" NOT NULL,
	"storage_bucket" varchar(120) NOT NULL,
	"storage_key" varchar(500) NOT NULL,
	"content_type" varchar(120) NOT NULL,
	"byte_size" integer NOT NULL,
	"checksum_sha256" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "render_artifacts_byte_size_positive" CHECK ("render_artifacts"."byte_size" > 0)
);
--> statement-breakpoint
CREATE TABLE "render_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"video_project_id" uuid NOT NULL,
	"project_revision_id" uuid NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"status" "render_job_status" DEFAULT 'queued' NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"error_code" varchar(100),
	"error_message" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "render_jobs_attempt_nonnegative" CHECK ("render_jobs"."attempt" >= 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"external_subject" varchar(200) NOT NULL,
	"email" varchar(320),
	"display_name" varchar(120) NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_briefs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"hotel_id" uuid NOT NULL,
	"title" varchar(160) NOT NULL,
	"platform" "video_platform" NOT NULL,
	"duration_seconds" integer NOT NULL,
	"aspect_ratio" varchar(10) DEFAULT '9:16' NOT NULL,
	"tone" varchar(80) NOT NULL,
	"language" varchar(20) DEFAULT 'zh-CN' NOT NULL,
	"objective" varchar(300),
	"target_audience" varchar(200),
	"call_to_action" varchar(200),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_briefs_duration_range" CHECK ("video_briefs"."duration_seconds" >= 5 and "video_briefs"."duration_seconds" <= 180),
	CONSTRAINT "video_briefs_vertical_aspect" CHECK ("video_briefs"."aspect_ratio" = '9:16')
);
--> statement-breakpoint
CREATE TABLE "video_projects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"hotel_id" uuid NOT NULL,
	"video_brief_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"template_key" varchar(120) NOT NULL,
	"status" "video_project_status" DEFAULT 'draft' NOT NULL,
	"current_revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_projects_revision_positive" CHECK ("video_projects"."current_revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "asset_segments" ADD CONSTRAINT "asset_segments_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_kits" ADD CONSTRAINT "brand_kits_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotels" ADD CONSTRAINT "hotels_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_revisions" ADD CONSTRAINT "project_revisions_video_project_id_video_projects_id_fk" FOREIGN KEY ("video_project_id") REFERENCES "public"."video_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_revisions" ADD CONSTRAINT "project_revisions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_reports" ADD CONSTRAINT "quality_reports_render_job_id_render_jobs_id_fk" FOREIGN KEY ("render_job_id") REFERENCES "public"."render_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "render_artifacts" ADD CONSTRAINT "render_artifacts_render_job_id_render_jobs_id_fk" FOREIGN KEY ("render_job_id") REFERENCES "public"."render_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "render_jobs" ADD CONSTRAINT "render_jobs_video_project_id_video_projects_id_fk" FOREIGN KEY ("video_project_id") REFERENCES "public"."video_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "render_jobs" ADD CONSTRAINT "render_jobs_project_revision_id_project_revisions_id_fk" FOREIGN KEY ("project_revision_id") REFERENCES "public"."project_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "render_jobs" ADD CONSTRAINT "render_jobs_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_briefs" ADD CONSTRAINT "video_briefs_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_projects" ADD CONSTRAINT "video_projects_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_projects" ADD CONSTRAINT "video_projects_video_brief_id_video_briefs_id_fk" FOREIGN KEY ("video_brief_id") REFERENCES "public"."video_briefs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_segments_asset_idx" ON "asset_segments" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "assets_hotel_idx" ON "assets" USING btree ("hotel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assets_storage_location_unique" ON "assets" USING btree ("storage_bucket","storage_key");--> statement-breakpoint
CREATE UNIQUE INDEX "brand_kits_hotel_unique" ON "brand_kits" USING btree ("hotel_id");--> statement-breakpoint
CREATE INDEX "hotels_organization_idx" ON "hotels" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hotels_organization_name_unique" ON "hotels" USING btree ("organization_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_organization_user_unique" ON "memberships" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_unique" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "project_revisions_project_revision_unique" ON "project_revisions" USING btree ("video_project_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "quality_reports_render_job_unique" ON "quality_reports" USING btree ("render_job_id");--> statement-breakpoint
CREATE INDEX "render_artifacts_job_idx" ON "render_artifacts" USING btree ("render_job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "render_artifacts_storage_location_unique" ON "render_artifacts" USING btree ("storage_bucket","storage_key");--> statement-breakpoint
CREATE INDEX "render_jobs_project_idx" ON "render_jobs" USING btree ("video_project_id");--> statement-breakpoint
CREATE INDEX "render_jobs_status_idx" ON "render_jobs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_external_subject_unique" ON "users" USING btree ("external_subject");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "video_briefs_hotel_idx" ON "video_briefs" USING btree ("hotel_id");--> statement-breakpoint
CREATE INDEX "video_projects_hotel_idx" ON "video_projects" USING btree ("hotel_id");