ALTER TABLE `services` ADD `description` text;--> statement-breakpoint
ALTER TABLE `services` ADD `mode` text DEFAULT 'presencial' NOT NULL;--> statement-breakpoint
ALTER TABLE `services` ADD `deposit_percent` integer DEFAULT 0 NOT NULL;