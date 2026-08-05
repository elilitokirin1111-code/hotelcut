CREATE TABLE "ai_reviews" (
  "id" uuid PRIMARY KEY NOT NULL,
  "video_project_id" uuid NOT NULL,
  "base_revision" integer NOT NULL,
  "status" varchar(20) DEFAULT 'open' NOT NULL,
  "summary" text NOT NULL,
  "score_basis_points" integer NOT NULL,
  "hook_score_basis_points" integer NOT NULL,
  "story_score_basis_points" integer NOT NULL,
  "selling_point_score_basis_points" integer NOT NULL,
  "pace_score_basis_points" integer NOT NULL,
  "caption_score_basis_points" integer NOT NULL,
  "music_score_basis_points" integer NOT NULL,
  "cta_score_basis_points" integer NOT NULL,
  "findings" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "model_name" varchar(200),
  "prompt_version" varchar(100),
  "generation_parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "input_summary" text,
  "applied_revision" integer,
  "dismissed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ai_reviews_status_valid" CHECK ("ai_reviews"."status" in ('open', 'applied', 'dismissed')),
  CONSTRAINT "ai_reviews_base_revision_positive" CHECK ("ai_reviews"."base_revision" > 0),
  CONSTRAINT "ai_reviews_score_ranges" CHECK ("ai_reviews"."score_basis_points" between 0 and 10000 and "ai_reviews"."hook_score_basis_points" between 0 and 10000 and "ai_reviews"."story_score_basis_points" between 0 and 10000 and "ai_reviews"."selling_point_score_basis_points" between 0 and 10000 and "ai_reviews"."pace_score_basis_points" between 0 and 10000 and "ai_reviews"."caption_score_basis_points" between 0 and 10000 and "ai_reviews"."music_score_basis_points" between 0 and 10000 and "ai_reviews"."cta_score_basis_points" between 0 and 10000)
);
--> statement-breakpoint
ALTER TABLE "ai_reviews" ADD CONSTRAINT "ai_reviews_video_project_id_video_projects_id_fk" FOREIGN KEY ("video_project_id") REFERENCES "public"."video_projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "ai_reviews_project_idx" ON "ai_reviews" USING btree ("video_project_id");
