ALTER TABLE `professionals` ADD `phone` text;--> statement-breakpoint
ALTER TABLE `professionals` ADD `role` text DEFAULT 'Especialista' NOT NULL;--> statement-breakpoint
ALTER TABLE `professionals` ADD `color` text DEFAULT '#7559f2' NOT NULL;