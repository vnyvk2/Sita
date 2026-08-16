ALTER TABLE "user_settings"
ADD COLUMN IF NOT EXISTS "library_scan_mode" varchar(20) DEFAULT 'automatic' NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_settings"
ADD COLUMN IF NOT EXISTS "last_scan_time" timestamp;
