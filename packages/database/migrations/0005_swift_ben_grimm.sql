CREATE TYPE "public"."ai_edit_command_status" AS ENUM('pending', 'applied', 'dismissed', 'reverted');--> statement-breakpoint
CREATE TYPE "public"."ai_generation_status" AS ENUM('pending', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."ai_review_status" AS ENUM('generated', 'partially_applied', 'applied', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."asset_purpose" AS ENUM('production_asset', 'reference_video');--> statement-breakpoint
CREATE TYPE "public"."asset_requirement_status" AS ENUM('missing', 'weak_match', 'matched');--> statement-breakpoint
CREATE TYPE "public"."creative_project_mode" AS ENUM('idea', 'script', 'reference', 'assets');--> statement-breakpoint
CREATE TYPE "public"."creative_project_status" AS ENUM('draft', 'planning', 'script_ready', 'waiting_assets', 'blueprint_ready', 'generated', 'completed');--> statement-breakpoint
CREATE TYPE "public"."creative_revision_author" AS ENUM('user', 'ai');--> statement-breakpoint
CREATE TABLE "ai_edit_commands" (
	"id" uuid PRIMARY KEY NOT NULL,
	"ai_review_run_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"command" jsonb NOT NULL,
	"status" "ai_edit_command_status" DEFAULT 'pending' NOT NULL,
	"result_project_revision_id" uuid,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_edit_commands_sequence_positive" CHECK ("ai_edit_commands"."sequence" > 0)
);
--> statement-breakpoint
CREATE TABLE "ai_generation_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"creative_project_id" uuid,
	"operation" varchar(80) NOT NULL,
	"status" "ai_generation_status" DEFAULT 'pending' NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"model_name" varchar(120) NOT NULL,
	"prompt_version" varchar(80) NOT NULL,
	"generation_parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"input_summary" text NOT NULL,
	"output_summary" text,
	"failure_reason" text,
	"created_by_user_id" uuid NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_generation_runs_attempt_positive" CHECK ("ai_generation_runs"."attempt" > 0)
);
--> statement-breakpoint
CREATE TABLE "ai_review_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"video_project_id" uuid NOT NULL,
	"project_revision_id" uuid NOT NULL,
	"creative_project_id" uuid,
	"score" integer NOT NULL,
	"summary" text NOT NULL,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "ai_review_status" DEFAULT 'generated' NOT NULL,
	"model_name" varchar(120) NOT NULL,
	"prompt_version" varchar(80) NOT NULL,
	"generation_parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"input_summary" text NOT NULL,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_review_runs_score_range" CHECK ("ai_review_runs"."score" >= 0 and "ai_review_runs"."score" <= 100)
);
--> statement-breakpoint
CREATE TABLE "asset_requirements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"creative_project_id" uuid NOT NULL,
	"script_scene_id" uuid,
	"description" text NOT NULL,
	"required_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"preferred_shot_type" varchar(40),
	"preferred_motion_type" varchar(40),
	"preferred_duration_ms" integer NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"matched_asset_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"candidate_matches" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "asset_requirement_status" DEFAULT 'missing' NOT NULL,
	"filming_instruction" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_requirements_duration_positive" CHECK ("asset_requirements"."preferred_duration_ms" > 0)
);
--> statement-breakpoint
CREATE TABLE "creative_brief_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"creative_project_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"direction" varchar(40),
	"raw_idea" text NOT NULL,
	"objective" varchar(300),
	"platform" "video_platform" NOT NULL,
	"duration_seconds" integer NOT NULL,
	"target_audience" varchar(200),
	"tone" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hotel_selling_points" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hard_constraints" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"user_prompt" text,
	"created_by" "creative_revision_author" NOT NULL,
	"model_name" varchar(120),
	"prompt_version" varchar(80),
	"generation_parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"input_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creative_brief_revisions_revision_positive" CHECK ("creative_brief_revisions"."revision" > 0),
	CONSTRAINT "creative_brief_revisions_duration_range" CHECK ("creative_brief_revisions"."duration_seconds" >= 5 and "creative_brief_revisions"."duration_seconds" <= 180)
);
--> statement-breakpoint
CREATE TABLE "creative_feedback_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"creative_project_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"event_type" varchar(80) NOT NULL,
	"subject_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creative_project_asset_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"creative_project_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"purpose" "asset_purpose" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creative_projects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"hotel_id" uuid NOT NULL,
	"title" varchar(160) NOT NULL,
	"mode" "creative_project_mode" NOT NULL,
	"status" "creative_project_status" DEFAULT 'draft' NOT NULL,
	"selected_brief_revision_id" uuid,
	"selected_script_revision_id" uuid,
	"selected_blueprint_id" uuid,
	"selected_video_project_id" uuid,
	"created_by_user_id" uuid NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "edit_blueprint_beats" (
	"id" uuid PRIMARY KEY NOT NULL,
	"edit_blueprint_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"start_ms" integer NOT NULL,
	"end_ms" integer NOT NULL,
	"purpose" text NOT NULL,
	"narration" text,
	"dialogue" text,
	"required_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"preferred_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"forbidden_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"preferred_shot_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"preferred_motion_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"minimum_shot_duration_ms" integer NOT NULL,
	"maximum_shot_duration_ms" integer NOT NULL,
	"maximum_asset_reuse" integer DEFAULT 1 NOT NULL,
	"audio_policy" varchar(20) NOT NULL,
	"caption" text,
	"transition_in" varchar(40),
	"transition_out" varchar(40),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "edit_blueprint_beats_sequence_positive" CHECK ("edit_blueprint_beats"."sequence" > 0),
	CONSTRAINT "edit_blueprint_beats_start_nonnegative" CHECK ("edit_blueprint_beats"."start_ms" >= 0),
	CONSTRAINT "edit_blueprint_beats_end_after_start" CHECK ("edit_blueprint_beats"."end_ms" > "edit_blueprint_beats"."start_ms"),
	CONSTRAINT "edit_blueprint_beats_shot_duration_range" CHECK ("edit_blueprint_beats"."minimum_shot_duration_ms" > 0 and "edit_blueprint_beats"."maximum_shot_duration_ms" >= "edit_blueprint_beats"."minimum_shot_duration_ms")
);
--> statement-breakpoint
CREATE TABLE "edit_blueprints" (
	"id" uuid PRIMARY KEY NOT NULL,
	"creative_project_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"duration_seconds" integer NOT NULL,
	"frame_rate" integer NOT NULL,
	"aspect_ratio" varchar(10) DEFAULT '9:16' NOT NULL,
	"style" jsonb NOT NULL,
	"music" jsonb NOT NULL,
	"caption_style" jsonb NOT NULL,
	"global_rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"seed" bigint NOT NULL,
	"compiler_version" varchar(40) NOT NULL,
	"source_asset_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reference_profile_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model_name" varchar(120),
	"prompt_version" varchar(80),
	"generation_parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"input_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "edit_blueprints_revision_positive" CHECK ("edit_blueprints"."revision" > 0),
	CONSTRAINT "edit_blueprints_duration_range" CHECK ("edit_blueprints"."duration_seconds" >= 5),
	CONSTRAINT "edit_blueprints_frame_rate_positive" CHECK ("edit_blueprints"."frame_rate" > 0),
	CONSTRAINT "edit_blueprints_vertical_aspect" CHECK ("edit_blueprints"."aspect_ratio" = '9:16'),
	CONSTRAINT "edit_blueprints_seed_nonnegative" CHECK ("edit_blueprints"."seed" >= 0)
);
--> statement-breakpoint
CREATE TABLE "reference_video_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"creative_project_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"duration_ms" integer NOT NULL,
	"narrative_pattern" varchar(200) NOT NULL,
	"hook_duration_ms" integer NOT NULL,
	"average_shot_duration_ms" integer NOT NULL,
	"shot_count" integer NOT NULL,
	"pace_curve" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"shot_type_distribution" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"transition_profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"caption_profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"audio_profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"emotional_curve" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reusable_style_rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"analysis_summary" text NOT NULL,
	"model_name" varchar(120),
	"prompt_version" varchar(80),
	"generation_parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"input_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reference_video_profiles_duration_positive" CHECK ("reference_video_profiles"."duration_ms" > 0),
	CONSTRAINT "reference_video_profiles_shot_count_nonnegative" CHECK ("reference_video_profiles"."shot_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "script_packages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"creative_project_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"title" varchar(160) NOT NULL,
	"hook" varchar(300) NOT NULL,
	"story_summary" text NOT NULL,
	"narrative_pattern" varchar(160) NOT NULL,
	"voiceover_script" text,
	"dialogue" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"captions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"call_to_action" varchar(300),
	"filming_tips" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"required_assets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_duration_ms" integer NOT NULL,
	"model_name" varchar(120),
	"prompt_version" varchar(80),
	"generation_parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"input_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "script_packages_revision_positive" CHECK ("script_packages"."revision" > 0),
	CONSTRAINT "script_packages_duration_positive" CHECK ("script_packages"."total_duration_ms" > 0)
);
--> statement-breakpoint
CREATE TABLE "script_scenes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"script_package_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"title" varchar(160) NOT NULL,
	"purpose" varchar(240) NOT NULL,
	"visual" text NOT NULL,
	"action" text NOT NULL,
	"narration" text,
	"dialogue" text,
	"duration_ms" integer NOT NULL,
	"shot_type" varchar(40),
	"motion_type" varchar(40),
	"filming_instruction" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "script_scenes_sequence_positive" CHECK ("script_scenes"."sequence" > 0),
	CONSTRAINT "script_scenes_duration_positive" CHECK ("script_scenes"."duration_ms" > 0)
);
--> statement-breakpoint
CREATE TABLE "shot_requirements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"script_package_id" uuid NOT NULL,
	"script_scene_id" uuid,
	"sequence" integer NOT NULL,
	"description" text NOT NULL,
	"required_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"preferred_shot_type" varchar(40),
	"preferred_motion_type" varchar(40),
	"preferred_duration_ms" integer NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"filming_instruction" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shot_requirements_duration_positive" CHECK ("shot_requirements"."preferred_duration_ms" > 0)
);
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "purpose" "asset_purpose" DEFAULT 'production_asset' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_edit_commands" ADD CONSTRAINT "ai_edit_commands_ai_review_run_id_ai_review_runs_id_fk" FOREIGN KEY ("ai_review_run_id") REFERENCES "public"."ai_review_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_edit_commands" ADD CONSTRAINT "ai_edit_commands_result_project_revision_id_project_revisions_id_fk" FOREIGN KEY ("result_project_revision_id") REFERENCES "public"."project_revisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generation_runs" ADD CONSTRAINT "ai_generation_runs_creative_project_id_creative_projects_id_fk" FOREIGN KEY ("creative_project_id") REFERENCES "public"."creative_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generation_runs" ADD CONSTRAINT "ai_generation_runs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_review_runs" ADD CONSTRAINT "ai_review_runs_video_project_id_video_projects_id_fk" FOREIGN KEY ("video_project_id") REFERENCES "public"."video_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_review_runs" ADD CONSTRAINT "ai_review_runs_project_revision_id_project_revisions_id_fk" FOREIGN KEY ("project_revision_id") REFERENCES "public"."project_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_review_runs" ADD CONSTRAINT "ai_review_runs_creative_project_id_creative_projects_id_fk" FOREIGN KEY ("creative_project_id") REFERENCES "public"."creative_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_requirements" ADD CONSTRAINT "asset_requirements_creative_project_id_creative_projects_id_fk" FOREIGN KEY ("creative_project_id") REFERENCES "public"."creative_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_requirements" ADD CONSTRAINT "asset_requirements_script_scene_id_script_scenes_id_fk" FOREIGN KEY ("script_scene_id") REFERENCES "public"."script_scenes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_brief_revisions" ADD CONSTRAINT "creative_brief_revisions_creative_project_id_creative_projects_id_fk" FOREIGN KEY ("creative_project_id") REFERENCES "public"."creative_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_feedback_events" ADD CONSTRAINT "creative_feedback_events_creative_project_id_creative_projects_id_fk" FOREIGN KEY ("creative_project_id") REFERENCES "public"."creative_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_feedback_events" ADD CONSTRAINT "creative_feedback_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_project_asset_links" ADD CONSTRAINT "creative_project_asset_links_creative_project_id_creative_projects_id_fk" FOREIGN KEY ("creative_project_id") REFERENCES "public"."creative_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_project_asset_links" ADD CONSTRAINT "creative_project_asset_links_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_projects" ADD CONSTRAINT "creative_projects_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_projects" ADD CONSTRAINT "creative_projects_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edit_blueprint_beats" ADD CONSTRAINT "edit_blueprint_beats_edit_blueprint_id_edit_blueprints_id_fk" FOREIGN KEY ("edit_blueprint_id") REFERENCES "public"."edit_blueprints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edit_blueprints" ADD CONSTRAINT "edit_blueprints_creative_project_id_creative_projects_id_fk" FOREIGN KEY ("creative_project_id") REFERENCES "public"."creative_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_video_profiles" ADD CONSTRAINT "reference_video_profiles_creative_project_id_creative_projects_id_fk" FOREIGN KEY ("creative_project_id") REFERENCES "public"."creative_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_video_profiles" ADD CONSTRAINT "reference_video_profiles_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_packages" ADD CONSTRAINT "script_packages_creative_project_id_creative_projects_id_fk" FOREIGN KEY ("creative_project_id") REFERENCES "public"."creative_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_scenes" ADD CONSTRAINT "script_scenes_script_package_id_script_packages_id_fk" FOREIGN KEY ("script_package_id") REFERENCES "public"."script_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shot_requirements" ADD CONSTRAINT "shot_requirements_script_package_id_script_packages_id_fk" FOREIGN KEY ("script_package_id") REFERENCES "public"."script_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shot_requirements" ADD CONSTRAINT "shot_requirements_script_scene_id_script_scenes_id_fk" FOREIGN KEY ("script_scene_id") REFERENCES "public"."script_scenes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_edit_commands_review_sequence_unique" ON "ai_edit_commands" USING btree ("ai_review_run_id","sequence");--> statement-breakpoint
CREATE INDEX "ai_generation_runs_project_idx" ON "ai_generation_runs" USING btree ("creative_project_id");--> statement-breakpoint
CREATE INDEX "ai_review_runs_video_project_idx" ON "ai_review_runs" USING btree ("video_project_id");--> statement-breakpoint
CREATE INDEX "asset_requirements_project_idx" ON "asset_requirements" USING btree ("creative_project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "creative_brief_revisions_project_revision_unique" ON "creative_brief_revisions" USING btree ("creative_project_id","revision");--> statement-breakpoint
CREATE INDEX "creative_feedback_events_project_idx" ON "creative_feedback_events" USING btree ("creative_project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "creative_project_asset_links_unique" ON "creative_project_asset_links" USING btree ("creative_project_id","asset_id","purpose");--> statement-breakpoint
CREATE INDEX "creative_projects_hotel_idx" ON "creative_projects" USING btree ("hotel_id");--> statement-breakpoint
CREATE INDEX "creative_projects_status_idx" ON "creative_projects" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "edit_blueprint_beats_blueprint_sequence_unique" ON "edit_blueprint_beats" USING btree ("edit_blueprint_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "edit_blueprints_project_revision_unique" ON "edit_blueprints" USING btree ("creative_project_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "reference_video_profiles_project_asset_unique" ON "reference_video_profiles" USING btree ("creative_project_id","asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "script_packages_project_revision_unique" ON "script_packages" USING btree ("creative_project_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "script_scenes_package_sequence_unique" ON "script_scenes" USING btree ("script_package_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "shot_requirements_package_sequence_unique" ON "shot_requirements" USING btree ("script_package_id","sequence");