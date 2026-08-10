CREATE TABLE IF NOT EXISTS "ai_templates" (
  "id" uuid PRIMARY KEY NOT NULL,
  "hotel_id" uuid NOT NULL,
  "name" text NOT NULL,
  "description" text NOT NULL,
  "duration_seconds" integer NOT NULL,
  "spec" jsonb NOT NULL,
  "created_by_user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_templates_hotel_id_idx" ON "ai_templates" ("hotel_id");
--> statement-breakpoint
ALTER TABLE "ai_templates" ADD CONSTRAINT "ai_templates_hotel_id_hotels_id_fk"
  FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE;
