CREATE TABLE IF NOT EXISTS "metadata_overrides" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "metadata_overrides_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"entity_kind" varchar(64) NOT NULL,
	"entity_id" varchar(256) NOT NULL,
	"field_id" varchar(64) NOT NULL,
	"string_value" text,
	"number_value" double precision,
	"boolean_value" boolean,
	"json_value" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_metadata_overrides_lookup" ON "metadata_overrides" USING btree ("entity_kind","entity_id","field_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_metadata_overrides_entity" ON "metadata_overrides" USING btree ("entity_kind","entity_id");
