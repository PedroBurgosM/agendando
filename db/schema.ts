import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const businesses = sqliteTable('businesses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ownerId: text('owner_id').notNull(), name: text('name').notNull(), slug: text('slug').notNull().unique(),
  timezone: text('timezone').notNull().default('America/Santiago'), createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (table) => [index('idx_businesses_owner_id').on(table.ownerId)]);
export const services = sqliteTable('services', {
  id: integer('id').primaryKey({ autoIncrement: true }), businessId: integer('business_id').notNull().references(() => businesses.id),
  name: text('name').notNull(), description: text('description'), mode: text('mode', { enum:['presencial','online','hibrido'] }).notNull().default('presencial'),
  durationMinutes: integer('duration_minutes').notNull(), priceClp: integer('price_clp').notNull(), depositPercent: integer('deposit_percent').notNull().default(0), active: integer('active', { mode:'boolean' }).notNull().default(true),
}, (table) => [uniqueIndex('idx_services_business_name').on(table.businessId, table.name)]);
export const professionals = sqliteTable('professionals', {
  id: integer('id').primaryKey({ autoIncrement: true }), businessId: integer('business_id').notNull().references(() => businesses.id),
  name: text('name').notNull(), email: text('email').notNull(), phone: text('phone'), role: text('role').notNull().default('Especialista'), color: text('color').notNull().default('#7559f2'), active: integer('active', { mode:'boolean' }).notNull().default(true),
}, (table) => [uniqueIndex('idx_professionals_business_name').on(table.businessId, table.name)]);
export const customers = sqliteTable('customers', {
  id: integer('id').primaryKey({ autoIncrement: true }), businessId: integer('business_id').notNull().references(() => businesses.id),
  name: text('name').notNull(), email: text('email').notNull(), phone: text('phone'), notes: text('notes'),
}, (table) => [uniqueIndex('idx_customers_business_email').on(table.businessId, table.email)]);
export const bookings = sqliteTable('bookings', {
  id: integer('id').primaryKey({ autoIncrement: true }), businessId: integer('business_id').notNull().references(() => businesses.id),
  serviceId: integer('service_id').notNull().references(() => services.id), professionalId: integer('professional_id').notNull().references(() => professionals.id),
  customerId: integer('customer_id').notNull().references(() => customers.id), startsAt: integer('starts_at', { mode:'timestamp' }).notNull(), endsAt: integer('ends_at', { mode:'timestamp' }).notNull(),
  status: text('status', { enum:['pending','confirmed','completed','cancelled','no_show'] }).notNull().default('confirmed'), paymentStatus: text('payment_status', { enum:['unpaid','partial','paid','refunded'] }).notNull().default('unpaid'),
  amountClp: integer('amount_clp').notNull(), createdAt: integer('created_at', { mode:'timestamp' }).notNull(),
}, (table) => [index('idx_bookings_professional_starts').on(table.professionalId, table.startsAt), index('idx_bookings_business_starts').on(table.businessId, table.startsAt)]);
