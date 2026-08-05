ALTER TABLE "creative_feedback_events" ADD COLUMN "hotel_id" uuid;
--> statement-breakpoint
ALTER TABLE "creative_feedback_events" ADD COLUMN "video_project_id" uuid;
--> statement-breakpoint
ALTER TABLE "creative_feedback_events" RENAME COLUMN "payload" TO "metadata";
--> statement-breakpoint
UPDATE "creative_feedback_events" AS event
SET "hotel_id" = project."hotel_id"
FROM "creative_projects" AS project
WHERE event."creative_project_id" = project."id";
--> statement-breakpoint
ALTER TABLE "creative_feedback_events" ALTER COLUMN "hotel_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "creative_feedback_events" ALTER COLUMN "creative_project_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "creative_feedback_events" DROP CONSTRAINT "creative_feedback_events_creative_project_id_creative_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "creative_feedback_events" ADD CONSTRAINT "creative_feedback_events_creative_project_id_creative_projects_id_fk" FOREIGN KEY ("creative_project_id") REFERENCES "public"."creative_projects"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "creative_feedback_events" ADD CONSTRAINT "creative_feedback_events_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "creative_feedback_events" ADD CONSTRAINT "creative_feedback_events_video_project_id_video_projects_id_fk" FOREIGN KEY ("video_project_id") REFERENCES "public"."video_projects"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "creative_feedback_events" ADD CONSTRAINT "creative_feedback_events_type_valid" CHECK ("creative_feedback_events"."event_type" in ('creative_direction_selected', 'script_revised', 'script_selected', 'video_version_selected', 'shot_replaced', 'ai_review_applied', 'ai_review_dismissed', 'final_render_requested'));
--> statement-breakpoint
CREATE INDEX "creative_feedback_events_hotel_created_idx" ON "creative_feedback_events" USING btree ("hotel_id", "created_at");
