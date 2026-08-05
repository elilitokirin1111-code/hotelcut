CREATE TABLE "creative_video_versions" (
  "id" uuid PRIMARY KEY NOT NULL,
  "creative_project_id" uuid NOT NULL,
  "edit_blueprint_id" uuid NOT NULL,
  "video_project_id" uuid NOT NULL,
  "variant" varchar(1) NOT NULL,
  "seed" bigint NOT NULL,
  "score_basis_points" integer NOT NULL,
  "hook_score_basis_points" integer NOT NULL,
  "selling_point_coverage_basis_points" integer NOT NULL,
  "pace_score_basis_points" integer NOT NULL,
  "used_asset_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "repeated_asset_count" integer DEFAULT 0 NOT NULL,
  "recommendation_reason" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "creative_video_versions_variant_valid" CHECK ("creative_video_versions"."variant" in ('A', 'B', 'C')),
  CONSTRAINT "creative_video_versions_seed_nonnegative" CHECK ("creative_video_versions"."seed" >= 0),
  CONSTRAINT "creative_video_versions_score_ranges" CHECK ("creative_video_versions"."score_basis_points" between 0 and 10000 and "creative_video_versions"."hook_score_basis_points" between 0 and 10000 and "creative_video_versions"."selling_point_coverage_basis_points" between 0 and 10000 and "creative_video_versions"."pace_score_basis_points" between 0 and 10000),
  CONSTRAINT "creative_video_versions_repeated_asset_nonnegative" CHECK ("creative_video_versions"."repeated_asset_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "creative_video_versions" ADD CONSTRAINT "creative_video_versions_creative_project_id_creative_projects_id_fk" FOREIGN KEY ("creative_project_id") REFERENCES "public"."creative_projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "creative_video_versions" ADD CONSTRAINT "creative_video_versions_edit_blueprint_id_edit_blueprints_id_fk" FOREIGN KEY ("edit_blueprint_id") REFERENCES "public"."edit_blueprints"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "creative_video_versions" ADD CONSTRAINT "creative_video_versions_video_project_id_video_projects_id_fk" FOREIGN KEY ("video_project_id") REFERENCES "public"."video_projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "creative_video_versions_project_variant_unique" ON "creative_video_versions" USING btree ("creative_project_id", "variant");
--> statement-breakpoint
CREATE INDEX "creative_video_versions_project_idx" ON "creative_video_versions" USING btree ("creative_project_id");
