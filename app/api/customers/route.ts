import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { getChatGPTUser } from '../../chatgpt-auth';

async function userOrResponse() {
  return getChatGPTUser();
}

async function getBusiness(ownerId: string, create = false) {
  let business = await env.DB.prepare('SELECT id FROM businesses WHERE owner_id = ? LIMIT 1').bind(ownerId).first<{ id:number }>();
  if (!business && create) {
    await env.DB.prepare(`INSERT OR IGNORE INTO businesses (owner_id, name, slug, timezone, created_at) VALUES (?, 'Espacio Bienestar', ?, 'America/Santiago', ?)`).bind(ownerId, `espacio-${ownerId}`, Math.floor(Date.now()/1000)).run();
    business = await env.DB.prepare('SELECT id FROM businesses WHERE owner_id = ? LIMIT 1').bind(ownerId).first<{ id:number }>();
  }
  return business;
}

export async function GET() {
  const user = await userOrResponse();
  if (!user) return NextResponse.json({ error:'Debes iniciar sesión.' }, { status:401 });
  const business = await getBusiness(user.userId);
  if (!business) return NextResponse.json({ customers:[], visits:[] });

  const customers = await env.DB.prepare(`
    SELECT c.id, c.name, c.email, c.phone, c.notes,
           COUNT(b.id) AS booking_count,
           COALESCE(SUM(CASE WHEN b.payment_status = 'paid' THEN b.amount_clp ELSE 0 END), 0) AS paid_total,
           MAX(b.starts_at) AS last_booking
    FROM customers c
    LEFT JOIN bookings b ON b.customer_id = c.id AND b.status != 'cancelled'
    WHERE c.business_id = ?
    GROUP BY c.id
    ORDER BY c.name COLLATE NOCASE ASC
  `).bind(business.id).all();
  const visits = await env.DB.prepare(`
    SELECT b.id, b.customer_id, b.starts_at, b.status, b.payment_status, b.amount_clp,
           s.name AS service_name, p.name AS professional_name
    FROM bookings b
    JOIN services s ON s.id = b.service_id
    JOIN professionals p ON p.id = b.professional_id
    WHERE b.business_id = ?
    ORDER BY b.starts_at DESC
  `).bind(business.id).all();
  return NextResponse.json({ customers:customers.results, visits:visits.results });
}

export async function POST(request:Request) {
  const user = await userOrResponse();
  if (!user) return NextResponse.json({ error:'Debes iniciar sesión.' }, { status:401 });
  const body = await request.json() as Record<string,unknown>;
  const name = String(body.name ?? '').trim();
  const email = String(body.email ?? '').trim().toLowerCase();
  const phone = String(body.phone ?? '').trim();
  const notes = String(body.notes ?? '').trim();
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error:'Ingresa un nombre y correo válidos.' }, { status:400 });
  const business = await getBusiness(user.userId, true);
  if (!business) return NextResponse.json({ error:'No se pudo preparar el negocio.' }, { status:500 });
  const duplicate = await env.DB.prepare('SELECT id FROM customers WHERE business_id = ? AND email = ?').bind(business.id,email).first();
  if (duplicate) return NextResponse.json({ error:'Ya existe un cliente con ese correo.' }, { status:409 });
  const result = await env.DB.prepare('INSERT INTO customers (business_id,name,email,phone,notes) VALUES (?,?,?,?,?)').bind(business.id,name,email,phone||null,notes||null).run();
  return NextResponse.json({ id:Number(result.meta.last_row_id), message:'Cliente creado correctamente.' }, { status:201 });
}

export async function PATCH(request:Request) {
  const user = await userOrResponse();
  if (!user) return NextResponse.json({ error:'Debes iniciar sesión.' }, { status:401 });
  const body = await request.json() as Record<string,unknown>;
  const id = Number(body.id); const name = String(body.name ?? '').trim(); const email = String(body.email ?? '').trim().toLowerCase();
  const phone = String(body.phone ?? '').trim(); const notes = String(body.notes ?? '').trim();
  if (!Number.isInteger(id) || !name || !/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error:'Datos inválidos.' }, { status:400 });
  const business = await getBusiness(user.userId);
  if (!business) return NextResponse.json({ error:'Cliente no encontrado.' }, { status:404 });
  const duplicate = await env.DB.prepare('SELECT id FROM customers WHERE business_id = ? AND email = ? AND id != ?').bind(business.id,email,id).first();
  if (duplicate) return NextResponse.json({ error:'Otro cliente ya utiliza ese correo.' }, { status:409 });
  const result = await env.DB.prepare('UPDATE customers SET name=?, email=?, phone=?, notes=? WHERE id=? AND business_id=?').bind(name,email,phone||null,notes||null,id,business.id).run();
  if (!result.meta.changes) return NextResponse.json({ error:'Cliente no encontrado.' }, { status:404 });
  return NextResponse.json({ message:'Cliente actualizado correctamente.' });
}
