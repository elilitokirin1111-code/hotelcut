CREATE TABLE "model_provider_settings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"hotel_id" uuid NOT NULL,
	"provider" varchar(40) NOT NULL,
	"base_url" varchar(500) NOT NULL,
	"api_mode" varchar(40) NOT NULL,
	"model" varchar(120) NOT NULL,
	"reasoning_effort" varchar(20) NOT NULL,
	"encrypted_api_key" text,
	"api_key_hint" varchar(24),
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "model_provider_settings" ADD CONSTRAINT "model_provider_settings_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "model_provider_settings_hotel_unique" ON "model_provider_settings" USING btree ("hotel_id");