ALTER TABLE `businesses` ADD `email` text;--> statement-breakpoint
ALTER TABLE `businesses` ADD `phone` text;--> statement-breakpoint
ALTER TABLE `businesses` ADD `address` text;--> statement-breakpoint
ALTER TABLE `businesses` ADD `description` text;--> statement-breakpoint
ALTER TABLE `businesses` ADD `currency` text DEFAULT 'CLP' NOT NULL;--> statement-breakpoint
ALTER TABLE `businesses` ADD `cancellation_hours` integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE `businesses` ADD `booking_window_days` integer DEFAULT 60 NOT NULL;