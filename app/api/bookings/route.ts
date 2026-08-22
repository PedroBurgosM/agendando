import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { getChatGPTUser } from '../../chatgpt-auth';

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
  const serviceId = Number(input.serviceId);
  const professionalId = Number(input.professionalId);
  const date = String(input.date ?? '');
  const time = String(input.time ?? '');
  const notes = String(input.notes ?? '').trim();

  if (!customerName || !/^\S+@\S+\.\S+$/.test(customerEmail) || !Number.isInteger(serviceId) || !Number.isInteger(professionalId) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return NextResponse.json({ error: 'Completa correctamente todos los campos obligatorios.' }, { status: 400 });
  }

  const start = new Date(`${date}T${time}:00-04:00`);
  if (Number.isNaN(start.getTime())) return NextResponse.json({ error: 'Fecha u hora inválida.' }, { status: 400 });
  const startsAt = Math.floor(start.getTime() / 1000);
  const db = env.DB;

  await db.prepare(`INSERT OR IGNORE INTO businesses (owner_id, name, slug, timezone, created_at) VALUES (?, 'Espacio Bienestar', ?, 'America/Santiago', ?)`).bind(user.userId, `espacio-${user.userId}`, Math.floor(Date.now() / 1000)).run();
  const business = await db.prepare('SELECT id FROM businesses WHERE owner_id = ? LIMIT 1').bind(user.userId).first<{ id: number }>();
  if (!business) return NextResponse.json({ error: 'No se pudo preparar el negocio.' }, { status: 500 });

  const serviceRow = await db.prepare('SELECT id,duration_minutes,price_clp FROM services WHERE id=? AND business_id=? AND active=1 LIMIT 1').bind(serviceId,business.id).first<{id:number;duration_minutes:number;price_clp:number}>();
  if(!serviceRow)return NextResponse.json({error:'El servicio no existe o está pausado.'},{status:400});
  const endsAt = startsAt + serviceRow.duration_minutes * 60;

  const professional = await db.prepare('SELECT id FROM professionals WHERE id=? AND business_id=? AND active=1 LIMIT 1').bind(professionalId,business.id).first<{id:number}>();
  if(!professional)return NextResponse.json({error:'El profesional no existe o su agenda está pausada.'},{status:400});

  const conflict = await db.prepare(`SELECT id FROM bookings WHERE professional_id = ? AND status != 'cancelled' AND starts_at < ? AND ends_at > ? LIMIT 1`).bind(professional.id, endsAt, startsAt).first();
  if (conflict) return NextResponse.json({ error: 'Ese profesional ya tiene una reserva en ese horario.' }, { status: 409 });

  let customer = await db.prepare('SELECT id FROM customers WHERE business_id = ? AND email = ? LIMIT 1').bind(business.id, customerEmail).first<{ id: number }>();
  if (!customer) {
    const result = await db.prepare('INSERT INTO customers (business_id, name, email, phone, notes) VALUES (?, ?, ?, ?, ?)').bind(business.id, customerName, customerEmail, customerPhone || null, notes || null).run();
    customer = { id: Number(result.meta.last_row_id) };
  } else {
    await db.prepare('UPDATE customers SET name = ?, phone = ?, notes = ? WHERE id = ?').bind(customerName, customerPhone || null, notes || null, customer.id).run();
  }

  const inserted = await db.prepare(`INSERT INTO bookings (business_id, service_id, professional_id, customer_id, starts_at, ends_at, status, payment_status, amount_clp, created_at) VALUES (?, ?, ?, ?, ?, ?, 'confirmed', 'unpaid', ?, ?)`).bind(business.id, serviceRow.id, professional.id, customer.id, startsAt, endsAt, serviceRow.price_clp, Math.floor(Date.now() / 1000)).run();

  return NextResponse.json({ id: Number(inserted.meta.last_row_id), message: 'Cita agendada correctamente.' }, { status: 201 });
}
