CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`business_id` integer NOT NULL,
	`customer_id` integer,
	`type` text NOT NULL,
	`channel` text DEFAULT 'whatsapp' NOT NULL,
	`recipient` text NOT NULL,
	`subject` text,
	`message` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`scheduled_for` integer,
	`sent_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_notifications_customer_id` ON `notifications` (`customer_id`);--> statement-breakpoint
CREATE INDEX `idx_notifications_status` ON `notifications` (`status`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`business_id` integer NOT NULL,
	`customer_id` integer NOT NULL,
	`amount` integer NOT NULL,
	`payment_date` integer NOT NULL,
	`period` text NOT NULL,
	`payment_method` text DEFAULT 'transfer' NOT NULL,
	`status` text DEFAULT 'completed' NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_payments_customer_id` ON `payments` (`customer_id`);--> statement-breakpoint
CREATE INDEX `idx_payments_business_id` ON `payments` (`business_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_professionals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`business_id` integer NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text,
	`role` text DEFAULT 'Instructor' NOT NULL,
	`color` text DEFAULT '#7559f2' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_professionals`("id", "business_id", "name", "email", "phone", "role", "color", "active") SELECT "id", "business_id", "name", "email", "phone", "role", "color", "active" FROM `professionals`;--> statement-breakpoint
DROP TABLE `professionals`;--> statement-breakpoint
ALTER TABLE `__new_professionals` RENAME TO `professionals`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_professionals_business_name` ON `professionals` (`business_id`,`name`);--> statement-breakpoint
ALTER TABLE `customers` ADD `plan_name` text DEFAULT 'Mensualidad Regular';--> statement-breakpoint
ALTER TABLE `customers` ADD `monthly_fee` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `payment_due_day` integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `membership_status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `last_payment_date` integer;--> statement-breakpoint
ALTER TABLE `customers` ADD `next_payment_due` integer;--> statement-breakpoint
ALTER TABLE `customers` ADD `notify_email` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `notify_whatsapp` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `services` ADD `class_type` text DEFAULT 'individual' NOT NULL;--> statement-breakpoint
ALTER TABLE `services` ADD `capacity` integer DEFAULT 1 NOT NULL;