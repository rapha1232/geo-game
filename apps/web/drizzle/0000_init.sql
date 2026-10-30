CREATE EXTENSION IF NOT EXISTS citext;
--> statement-breakpoint
CREATE TABLE "challenges" (
	"code" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"payload" text NOT NULL,
	"payload_hash" text NOT NULL,
	"content_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"creator_user_id" uuid,
	CONSTRAINT "challenges_payload_len" CHECK (length("challenges"."payload") <= 2048)
);
--> statement-breakpoint
CREATE TABLE "content_releases" (
	"version" text PRIMARY KEY NOT NULL,
	"released_at" timestamp with time zone NOT NULL,
	"manifest_sha256" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"severity" text,
	"category" text NOT NULL,
	"message" text NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"target_ref" text,
	"content_version" text NOT NULL,
	"reporter_email" "citext",
	"user_id" uuid,
	"duplicate_of" uuid,
	"assigned_to" uuid,
	"resolution_note" text,
	"resolved_in_version" text,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "reports_status_check" CHECK (status IN ('new', 'triaged', 'accepted', 'declined', 'fixed', 'duplicate')),
	CONSTRAINT "reports_severity_check" CHECK ("reports"."severity" IS NULL OR severity IN ('S1', 'S2', 'S3')),
	CONSTRAINT "reports_category_check" CHECK (category IN ('answer_rejected', 'answer_accepted_wrongly', 'wrong_fact', 'map_issue', 'spelling', 'sensitive', 'other')),
	CONSTRAINT "reports_message_len" CHECK (length("reports"."message") BETWEEN 10 AND 1000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "challenges_payload_hash_key" ON "challenges" USING btree ("payload_hash");--> statement-breakpoint
CREATE INDEX "challenges_last_used_at_idx" ON "challenges" USING btree ("last_used_at");--> statement-breakpoint
CREATE INDEX "reports_status_created_idx" ON "reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "reports_target_ref_idx" ON "reports" USING btree ("target_ref");