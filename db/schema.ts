import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const businesses = sqliteTable('businesses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ownerId: text('owner_id').notNull(), name: text('name').notNull(), slug: text('slug').notNull().unique(),
  email: text('email'), phone: text('phone'), address: text('address'), description: text('description'),
  timezone: text('timezone').notNull().default('America/Santiago'), currency: text('currency').notNull().default('CLP'), cancellationHours: integer('cancellation_hours').notNull().default(24), bookingWindowDays: integer('booking_window_days').notNull().default(60), createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (table) => [index('idx_businesses_owner_id').on(table.ownerId)]);
export const services = sqliteTable('services', {
  id: integer('id').primaryKey({ autoIncrement: true }), businessId: integer('business_id').notNull().references(() => businesses.id),
  name: text('name').notNull(), description: text('description'), mode: text('mode', { enum:['presencial','online','hibrido'] }).notNull().default('presencial'),
  classType: text('class_type', { enum:['individual','grupal'] }).notNull().default('individual'),
  capacity: integer('capacity').notNull().default(1),
  billingPeriod: text('billing_period', { enum:['mensual','anual','sesion'] }).notNull().default('mensual'),
  schedule: text('schedule'),
  durationMinutes: integer('duration_minutes').notNull(), priceClp: integer('price_clp').notNull(), depositPercent: integer('deposit_percent').notNull().default(0), active: integer('active', { mode:'boolean' }).notNull().default(true),
}, (table) => [uniqueIndex('idx_services_business_name').on(table.businessId, table.name)]);
export const professionals = sqliteTable('professionals', {
  id: integer('id').primaryKey({ autoIncrement: true }), businessId: integer('business_id').notNull().references(() => businesses.id),
  name: text('name').notNull(), email: text('email').notNull(), phone: text('phone'), role: text('role').notNull().default('Instructor'), color: text('color').notNull().default('#7559f2'), active: integer('active', { mode:'boolean' }).notNull().default(true),
}, (table) => [uniqueIndex('idx_professionals_business_name').on(table.businessId, table.name)]);
export const customers = sqliteTable('customers', {
  id: integer('id').primaryKey({ autoIncrement: true }), businessId: integer('business_id').notNull().references(() => businesses.id),
  name: text('name').notNull(), email: text('email').notNull(), phone: text('phone'), notes: text('notes'),
  planName: text('plan_name').default('Mensualidad Regular'),
  monthlyFee: integer('monthly_fee').notNull().default(0),
  paymentDueDay: integer('payment_due_day').notNull().default(5),
  membershipStatus: text('membership_status', { enum:['active','pending','overdue','inactive'] }).notNull().default('active'),
  lastPaymentDate: integer('last_payment_date', { mode:'timestamp' }),
  nextPaymentDue: integer('next_payment_due', { mode:'timestamp' }),
  notifyEmail: integer('notify_email', { mode:'boolean' }).notNull().default(true),
  notifyWhatsapp: integer('notify_whatsapp', { mode:'boolean' }).notNull().default(true),
}, (table) => [uniqueIndex('idx_customers_business_email').on(table.businessId, table.email)]);
export const bookings = sqliteTable('bookings', {
  id: integer('id').primaryKey({ autoIncrement: true }), businessId: integer('business_id').notNull().references(() => businesses.id),
  serviceId: integer('service_id').notNull().references(() => services.id), professionalId: integer('professional_id').notNull().references(() => professionals.id),
  customerId: integer('customer_id').notNull().references(() => customers.id), startsAt: integer('starts_at', { mode:'timestamp' }).notNull(), endsAt: integer('ends_at', { mode:'timestamp' }).notNull(),
  status: text('status', { enum:['pending','confirmed','completed','cancelled','no_show'] }).notNull().default('confirmed'), paymentStatus: text('payment_status', { enum:['unpaid','partial','paid','refunded'] }).notNull().default('unpaid'),
  amountClp: integer('amount_clp').notNull(), createdAt: integer('created_at', { mode:'timestamp' }).notNull(),
}, (table) => [index('idx_bookings_professional_starts').on(table.professionalId, table.startsAt), index('idx_bookings_business_starts').on(table.businessId, table.startsAt)]);

export const payments = sqliteTable('payments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  businessId: integer('business_id').notNull().references(() => businesses.id),
  customerId: integer('customer_id').notNull().references(() => customers.id),
  amount: integer('amount').notNull(),
  paymentDate: integer('payment_date', { mode: 'timestamp' }).notNull(),
  period: text('period').notNull(), // ej: "2026-09" o "Septiembre 2026"
  paymentMethod: text('payment_method', { enum: ['transfer', 'cash', 'card', 'other'] }).notNull().default('transfer'),
  status: text('status', { enum: ['completed', 'pending', 'refunded'] }).notNull().default('completed'),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (table) => [index('idx_payments_customer_id').on(table.customerId), index('idx_payments_business_id').on(table.businessId)]);

export const notifications = sqliteTable('notifications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  businessId: integer('business_id').notNull().references(() => businesses.id),
  customerId: integer('customer_id').references(() => customers.id),
  type: text('type', { enum: ['payment_due', 'class_reminder', 'booking_confirmed', 'payment_received'] }).notNull(),
  channel: text('channel', { enum: ['whatsapp', 'email'] }).notNull().default('whatsapp'),
  recipient: text('recipient').notNull(), // Email o número telefónico
  subject: text('subject'),
  message: text('message').notNull(),
  status: text('status', { enum: ['pending', 'sent', 'failed'] }).notNull().default('pending'),
  scheduledFor: integer('scheduled_for', { mode: 'timestamp' }),
  sentAt: integer('sent_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (table) => [index('idx_notifications_customer_id').on(table.customerId), index('idx_notifications_status').on(table.status)]);

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  role: text('role', { enum: ['admin', 'instructor', 'staff'] }).notNull().default('admin'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (table) => [uniqueIndex('idx_users_email').on(table.email)]);


