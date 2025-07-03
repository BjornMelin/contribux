-- Migration: Add user_preferences table for search filtering and personalization
-- Generated on: 2025-07-01

-- Create contribution_type enum if it doesn't exist
DO $$ BEGIN
    CREATE TYPE "contribution_type" AS ENUM('bug_fix', 'feature', 'documentation', 'testing', 'maintenance', 'enhancement');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create user_preferences table
CREATE TABLE IF NOT EXISTS "user_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"preferred_contribution_types" "contribution_type"[],
	"max_estimated_hours" integer DEFAULT 10,
	"notification_frequency" integer DEFAULT 24,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);

-- Add foreign key constraint
DO $$ BEGIN
 ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Add unique constraint on user_id (one preference record per user)
DO $$ BEGIN
 ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_unique" UNIQUE("user_id");
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS "idx_user_preferences_user_id" ON "user_preferences" ("user_id");

-- Add check constraints
DO $$ BEGIN
 ALTER TABLE "user_preferences" ADD CONSTRAINT "max_hours_positive" CHECK ("max_estimated_hours" > 0);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "user_preferences" ADD CONSTRAINT "notification_freq_positive" CHECK ("notification_frequency" > 0);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;