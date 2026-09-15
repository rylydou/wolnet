ALTER TABLE `devices` ADD `status` text DEFAULT 'offline' NOT NULL;--> statement-breakpoint
ALTER TABLE `devices` ADD `status_changed_at` integer;--> statement-breakpoint
ALTER TABLE `devices` DROP COLUMN `last_online_at`;