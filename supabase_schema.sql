-- ==============================================================================
-- AGENDANDO - ESQUEMA DE BASE DE DATOS PARA SUPABASE (POSTGRESQL)
-- ==============================================================================
-- Instrucciones:
-- 1. Ve a tu proyecto en Supabase (https://supabase.com).
-- 2. Entra en "SQL Editor" en el menú izquierdo.
-- 3. Pega todo este contenido y haz clic en "RUN".
-- ==============================================================================

-- 1. Tabla de Usuarios (Administradores e Instructores)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'instructor', 'staff')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Tabla de Negocios / Espacios
CREATE TABLE IF NOT EXISTS businesses (
  id SERIAL PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  email TEXT,
  phone TEXT,
  address TEXT,
  description TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/Santiago',
  currency TEXT NOT NULL DEFAULT 'CLP',
  cancellation_hours INTEGER NOT NULL DEFAULT 24,
  booking_window_days INTEGER NOT NULL DEFAULT 60,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_businesses_owner_id ON businesses(owner_id);

-- 3. Tabla de Profesionales / Instructores del Negocio
CREATE TABLE IF NOT EXISTS professionals (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'Instructor',
  color TEXT NOT NULL DEFAULT '#7559f2',
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_professionals_business_id ON professionals(business_id);

-- 4. Tabla de Clases / Servicios
CREATE TABLE IF NOT EXISTS services (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  mode TEXT NOT NULL DEFAULT 'presencial' CHECK (mode IN ('presencial', 'online', 'hibrido')),
  class_type TEXT NOT NULL DEFAULT 'individual' CHECK (class_type IN ('individual', 'grupal')),
  capacity INTEGER NOT NULL DEFAULT 1,
  billing_period TEXT NOT NULL DEFAULT 'mensual' CHECK (billing_period IN ('mensual', 'anual', 'sesion')),
  schedule TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  price_clp INTEGER NOT NULL DEFAULT 0,
  deposit_percent INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_services_business_id ON services(business_id);

-- 5. Tabla de Alumnos / Clientes
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  notes TEXT,
  plan_name TEXT DEFAULT 'Mensualidad Regular',
  monthly_fee INTEGER NOT NULL DEFAULT 0,
  payment_due_day INTEGER NOT NULL DEFAULT 5,
  membership_status TEXT NOT NULL DEFAULT 'active' CHECK (membership_status IN ('active', 'pending', 'overdue', 'inactive')),
  last_payment_date TIMESTAMP WITH TIME ZONE,
  next_payment_due TIMESTAMP WITH TIME ZONE,
  notify_email BOOLEAN NOT NULL DEFAULT TRUE,
  notify_whatsapp BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_customers_business_id ON customers(business_id);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);

-- 6. Tabla de Reservas y Agendamientos
CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  professional_id INTEGER NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  starts_at TIMESTAMP WITH TIME ZONE NOT NULL,
  ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'no_show')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid', 'refunded')),
  amount_clp INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookings_professional_starts ON bookings(professional_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_bookings_business_starts ON bookings(business_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_bookings_customer_id ON bookings(customer_id);

-- 7. Tabla de Pagos de Mensualidades
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  payment_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  period TEXT NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'transfer' CHECK (payment_method IN ('transfer', 'cash', 'card', 'other')),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'pending', 'refunded')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_business_id ON payments(business_id);

-- 8. Tabla de Notificaciones y Avisos Automáticos
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('payment_due', 'class_reminder', 'booking_confirmed', 'payment_received')),
  channel TEXT NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp', 'email')),
  recipient TEXT NOT NULL,
  subject TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  scheduled_for TIMESTAMP WITH TIME ZONE,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_customer_id ON notifications(customer_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);

-- ==============================================================================
-- DATOS INICIALES (SEMILLA / SEED)
-- ==============================================================================

-- 1. Usuario Administrador Inicial
-- Correo: admin@agendando.cl
-- Contraseña: admin123
INSERT INTO users (email, password_hash, name, role, created_at)
VALUES (
  'admin@agendando.cl',
  'd0c4ef6782a141c6d8a43f9494dd06a1:e7f1ca73012f61b7caac8502f5bbaf07ac70b9ebfe1315245fbd33a40bdf3853',
  'Administrador Woodland',
  'admin',
  NOW()
)
ON CONFLICT (email) DO NOTHING;

-- 2. Negocio Inicial vinculado al admin
INSERT INTO businesses (id, owner_id, name, slug, email, phone, address, description, timezone, currency, cancellation_hours, booking_window_days, created_at)
VALUES (
  1,
  '1',
  'Espacio de Clases Agendando',
  'espacio-principal',
  'admin@agendando.cl',
  '+56 9 1234 5678',
  'Santiago, Chile',
  'Centro de entrenamiento, clases y actividades.',
  'America/Santiago',
  'CLP',
  24,
  60,
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- 3. Instructor Inicial
INSERT INTO professionals (business_id, name, email, phone, role, color, active)
VALUES (
  1,
  'Pedro',
  'pedro@agendando.cl',
  '+56 9 8765 4321',
  'Instructor Principal',
  '#7559f2',
  TRUE
)
ON CONFLICT DO NOTHING;

-- 4. Clase / Servicio Inicial
INSERT INTO services (business_id, name, description, mode, class_type, capacity, billing_period, schedule, duration_minutes, price_clp, deposit_percent, active)
VALUES (
  1,
  'Clase Grupal de Entrenamiento',
  'Sesión guiada para mejorar resistencia y condición física.',
  'presencial',
  'grupal',
  12,
  'mensual',
  'Lunes a Viernes 09:00 - 10:00',
  60,
  35000,
  0,
  TRUE
)
ON CONFLICT DO NOTHING;
