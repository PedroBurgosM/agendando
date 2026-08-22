CREATE INDEX `idx_bookings_professional_starts` ON `bookings` (`professional_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `idx_bookings_business_starts` ON `bookings` (`business_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `idx_businesses_owner_id` ON `businesses` (`owner_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_customers_business_email` ON `customers` (`business_id`,`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_professionals_business_name` ON `professionals` (`business_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_services_business_name` ON `services` (`business_id`,`name`);