CREATE TABLE "spotify_integrations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "spotify_integrations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"spotify_user_id" varchar(255) NOT NULL,
	"display_name" varchar(255),
	"email" varchar(255),
	"product" varchar(50),
	"encrypted_access_token" text NOT NULL,
	"encrypted_refresh_token" text NOT NULL,
	"token_expires_at" timestamp with time zone NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_spotify_user_id" ON "spotify_integrations" USING btree ("spotify_user_id");
