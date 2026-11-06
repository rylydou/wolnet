ALTER TABLE `devices` RENAME COLUMN `comment` TO `name`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_devices` (
	`index` integer PRIMARY KEY,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`id` text NOT NULL UNIQUE,
	`name` text,
	`hostname` text UNIQUE,
	`ip` text UNIQUE,
	`mac_address` integer UNIQUE,
	`last_woken_at` integer
);
--> statement-breakpoint
INSERT INTO `__new_devices`(`index`, `created_at`, `updated_at`, `id`, `hostname`, `ip`, `mac_address`, `name`, `last_woken_at`) SELECT `index`, `created_at`, `updated_at`, `id`, `hostname`, `ip`, `mac_address`, `name`, `last_woken_at` FROM `devices`;--> statement-breakpoint
DROP TABLE `devices`;--> statement-breakpoint
ALTER TABLE `__new_devices` RENAME TO `devices`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
DROP INDEX IF EXISTS `id`;--> statement-breakpoint
DROP INDEX IF EXISTS `hostname`;--> statement-breakpoint
DROP INDEX IF EXISTS `ip`;--> statement-breakpoint
DROP INDEX IF EXISTS `macAddress`;--> statement-breakpoint
UPDATE `devices` SET `name` = NULL WHERE `name` = '';