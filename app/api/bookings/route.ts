import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { getChatGPTUser } from '../../chatgpt-auth';

const serviceCatalog: Record<string, { duration: number; price: number }> = {
  'Evaluación inicial': { duration: 60, price: 35000 },
  'Sesión de seguimiento': { duration: 45, price: 28000 },
  'Consulta online': { duration: 45, price: 25000 },
};

async function requireApiUser() {
  const user = await getChatGPTUser();
  if (!user) return null;
  return user;
}

export async function GET() {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: 'Debes iniciar sesión.' }, { status: 401 });

  const result = await env.DB.prepare(`
    SELECT b.id, b.starts_at, b.ends_at, b.status, b.payment_status, b.amount_clp,
           c.name AS customer_name, c.email AS customer_email, c.phone AS customer_phone,
           s.name AS service_name, p.name AS professional_name
    FROM bookings b
    JOIN businesses n ON n.id = b.business_id
    JOIN customers c ON c.id = b.customer_id
    JOIN services s ON s.id = b.service_id
    JOIN professionals p ON p.id = b.professional_id
    WHERE n.owner_id = ? AND b.status != 'cancelled'
    ORDER BY b.starts_at ASC
  `).bind(user.userId).all();

  return NextResponse.json({ bookings: result.results });
}

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: 'Debes iniciar sesión.' }, { status: 401 });

  let input: Record<string, unknown>;
  try { input = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 }); }

  const customerName = String(input.customerName ?? '').trim();
  const customerEmail = String(input.customerEmail ?? '').trim().toLowerCase();
  const customerPhone = String(input.customerPhone ?? '').trim();
  const serviceName = String(input.service ?? '');
  const professionalName = String(input.professional ?? '');
  const date = String(input.date ?? '');
  const time = String(input.time ?? '');
  const notes = String(input.notes ?? '').trim();
  const service = serviceCatalog[serviceName];

  if (!customerName || !/^\S+@\S+\.\S+$/.test(customerEmail) || !service || !['Sofía Martínez','Martín Reyes'].includes(professionalName) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return NextResponse.json({ error: 'Completa correctamente todos los campos obligatorios.' }, { status: 400 });
  }

  const start = new Date(`${date}T${time}:00-04:00`);
  if (Number.isNaN(start.getTime())) return NextResponse.json({ error: 'Fecha u hora inválida.' }, { status: 400 });
  const startsAt = Math.floor(start.getTime() / 1000);
  const endsAt = startsAt + service.duration * 60;
  const db = env.DB;

  await db.prepare(`INSERT OR IGNORE INTO businesses (owner_id, name, slug, timezone, created_at) VALUES (?, 'Espacio Bienestar', ?, 'America/Santiago', ?)`).bind(user.userId, `espacio-${user.userId}`, Math.floor(Date.now() / 1000)).run();
  const business = await db.prepare('SELECT id FROM businesses WHERE owner_id = ? LIMIT 1').bind(user.userId).first<{ id: number }>();
  if (!business) return NextResponse.json({ error: 'No se pudo preparar el negocio.' }, { status: 500 });

  let serviceRow = await db.prepare('SELECT id FROM services WHERE business_id = ? AND name = ? LIMIT 1').bind(business.id, serviceName).first<{ id: number }>();
  if (!serviceRow) {
    const result = await db.prepare('INSERT INTO services (business_id, name, duration_minutes, price_clp, active) VALUES (?, ?, ?, ?, 1)').bind(business.id, serviceName, service.duration, service.price).run();
    serviceRow = { id: Number(result.meta.last_row_id) };
  }

  let professional = await db.prepare('SELECT id FROM professionals WHERE business_id = ? AND name = ? LIMIT 1').bind(business.id, professionalName).first<{ id: number }>();
  if (!professional) {
    const email = professionalName.startsWith('Sofía') ? 'sofia@nexo.demo' : 'martin@nexo.demo';
    const result = await db.prepare('INSERT INTO professionals (business_id, name, email, active) VALUES (?, ?, ?, 1)').bind(business.id, professionalName, email).run();
    professional = { id: Number(result.meta.last_row_id) };
  }

  const conflict = await db.prepare(`SELECT id FROM bookings WHERE professional_id = ? AND status != 'cancelled' AND starts_at < ? AND ends_at > ? LIMIT 1`).bind(professional.id, endsAt, startsAt).first();
  if (conflict) return NextResponse.json({ error: 'Ese profesional ya tiene una reserva en ese horario.' }, { status: 409 });

  let customer = await db.prepare('SELECT id FROM customers WHERE business_id = ? AND email = ? LIMIT 1').bind(business.id, customerEmail).first<{ id: number }>();
  if (!customer) {
    const result = await db.prepare('INSERT INTO customers (business_id, name, email, phone, notes) VALUES (?, ?, ?, ?, ?)').bind(business.id, customerName, customerEmail, customerPhone || null, notes || null).run();
    customer = { id: Number(result.meta.last_row_id) };
  } else {
    await db.prepare('UPDATE customers SET name = ?, phone = ?, notes = ? WHERE id = ?').bind(customerName, customerPhone || null, notes || null, customer.id).run();
  }

  const inserted = await db.prepare(`INSERT INTO bookings (business_id, service_id, professional_id, customer_id, starts_at, ends_at, status, payment_status, amount_clp, created_at) VALUES (?, ?, ?, ?, ?, ?, 'confirmed', 'unpaid', ?, ?)`).bind(business.id, serviceRow.id, professional.id, customer.id, startsAt, endsAt, service.price, Math.floor(Date.now() / 1000)).run();

  return NextResponse.json({ id: Number(inserted.meta.last_row_id), message: 'Cita agendada correctamente.' }, { status: 201 });
}
