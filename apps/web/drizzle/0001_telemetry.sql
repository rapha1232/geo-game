CREATE TABLE "answer_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"session_hash" text NOT NULL,
	"game_id" text NOT NULL,
	"item_kind" text NOT NULL,
	"item_id" text NOT NULL,
	"prompt_id" text,
	"answer_entity_id" text,
	"correct" boolean NOT NULL,
	"attempt" smallint NOT NULL,
	"difficulty_setting" text NOT NULL,
	"content_version" text NOT NULL,
	"aggregated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "calibration_stats" (
	"item_kind" text NOT NULL,
	"item_id" text NOT NULL,
	"prompt_id" text DEFAULT '' NOT NULL,
	"n" integer DEFAULT 0 NOT NULL,
	"correct_first" integer DEFAULT 0 NOT NULL,
	"pick_counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calibration_stats_item_kind_item_id_prompt_id_pk" PRIMARY KEY("item_kind","item_id","prompt_id")
);
--> statement-breakpoint
CREATE INDEX "answer_events_occurred_idx" ON "answer_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "answer_events_pending_idx" ON "answer_events" USING btree ("id") WHERE "answer_events"."aggregated_at" IS NULL;