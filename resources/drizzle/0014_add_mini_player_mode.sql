ALTER TABLE "user_settings"
ADD COLUMN IF NOT EXISTS "mini_player_mode" varchar(20) DEFAULT 'standard' NOT NULL;
