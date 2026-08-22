import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const businesses = sqliteTable('businesses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ownerId: text('owner_id').notNull(), name: text('name').notNull(), slug: text('slug').notNull().unique(),
  timezone: text('timezone').notNull().default('America/Santiago'), createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});
export const services = sqliteTable('services', {
  id: integer('id').primaryKey({ autoIncrement: true }), businessId: integer('business_id').notNull().references(() => businesses.id),
  name: text('name').notNull(), durationMinutes: integer('duration_minutes').notNull(), priceClp: integer('price_clp').notNull(), active: integer('active', { mode:'boolean' }).notNull().default(true),
});
export const professionals = sqliteTable('professionals', {
  id: integer('id').primaryKey({ autoIncrement: true }), businessId: integer('business_id').notNull().references(() => businesses.id),
  name: text('name').notNull(), email: text('email').notNull(), active: integer('active', { mode:'boolean' }).notNull().default(true),
});
export const customers = sqliteTable('customers', {
  id: integer('id').primaryKey({ autoIncrement: true }), businessId: integer('business_id').notNull().references(() => businesses.id),
  name: text('name').notNull(), email: text('email').notNull(), phone: text('phone'), notes: text('notes'),
});
export const bookings = sqliteTable('bookings', {
  id: integer('id').primaryKey({ autoIncrement: true }), businessId: integer('business_id').notNull().references(() => businesses.id),
  serviceId: integer('service_id').notNull().references(() => services.id), professionalId: integer('professional_id').notNull().references(() => professionals.id),
  customerId: integer('customer_id').notNull().references(() => customers.id), startsAt: integer('starts_at', { mode:'timestamp' }).notNull(), endsAt: integer('ends_at', { mode:'timestamp' }).notNull(),
  status: text('status', { enum:['pending','confirmed','completed','cancelled','no_show'] }).notNull().default('confirmed'), paymentStatus: text('payment_status', { enum:['unpaid','partial','paid','refunded'] }).notNull().default('unpaid'),
  amountClp: integer('amount_clp').notNull(), createdAt: integer('created_at', { mode:'timestamp' }).notNull(),
});
