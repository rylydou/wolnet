CREATE TABLE `devices` (
	`index` integer PRIMARY KEY,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`id` text NOT NULL UNIQUE,
	`hostname` text UNIQUE,
	`ip` text UNIQUE,
	`mac_address` integer UNIQUE,
	`comment` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'offline' NOT NULL,
	`status_changed_at` integer,
	`last_woken_at` integer
);
--> statement-breakpoint
CREATE INDEX `id` ON `devices` (`id`);--> statement-breakpoint
CREATE INDEX `hostname` ON `devices` (`hostname`);--> statement-breakpoint
CREATE INDEX `ip` ON `devices` (`ip`);--> statement-breakpoint
CREATE INDEX `macAddress` ON `devices` (`mac_address`);