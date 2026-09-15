CREATE TABLE `devices` (
	`index` integer PRIMARY KEY,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`hostname` text,
	`ip` text,
	`mac_address` integer,
	`last_online_at` integer,
	`last_woken_at` integer
);
