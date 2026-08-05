DROP INDEX "reference_video_profiles_project_asset_unique";--> statement-breakpoint
ALTER TABLE "reference_video_profiles" ADD COLUMN "revision" integer NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "reference_video_profiles_project_asset_revision_unique" ON "reference_video_profiles" USING btree ("creative_project_id","asset_id","revision");