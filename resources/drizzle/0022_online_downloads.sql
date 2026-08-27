ALTER TABLE "user_settings" ADD COLUMN "online_downloads_folder" text;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "downloads_duplicate_policy" varchar(20) DEFAULT 'SKIP' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "add_downloads_to_library" boolean DEFAULT true NOT NULL;