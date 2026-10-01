import { NextResponse } from 'next/server';
import { getChatGPTUser } from '../../chatgpt-auth';
import { getSupabase } from '../../lib/supabase';

async function businessFor(supabase: any, ownerId: string, create = false) {
  let { data: b } = await supabase
    .from('businesses')
    .select('*')
    .or(`owner_id.eq.${ownerId},owner_id.eq.1,owner_id.eq.usr_local_instructor`)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!b && create) {
    const { data: created } = await supabase
      .from('businesses')
      .insert({
        owner_id: ownerId,
        name: 'Agendando',
        slug: `agendando-${ownerId}-${Date.now()}`,
        timezone: 'America/Santiago',
      })
      .select()
      .single();
    b = created;
  }
  return b;
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Debes iniciar sesión.' }, { status: 401 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 500 });

  const b = await businessFor(supabase, user.userId, true);
  if (!b) return NextResponse.json({ error: 'No se pudo preparar el negocio.' }, { status: 500 });

  const { data: team, error } = await supabase
    .from('professionals')
    .select(`
      id, name, email, phone, role, color, active,
      bookings(id, starts_at, status, payment_status, amount_clp)
    `)
    .eq('business_id', b.id)
    .order('active', { ascending: false })
    .order('name', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const nowIso = new Date().toISOString();

  const mapped = (team || []).map((p: any) => {
    const activeBookings = (p.bookings || []).filter((bk: any) => bk.status !== 'cancelled');
    const paidTotal = activeBookings
      .filter((bk: any) => bk.payment_status === 'paid')
      .reduce((sum: number, bk: any) => sum + (bk.amount_clp || 0), 0);
    const upcomingCount = activeBookings.filter((bk: any) => bk.starts_at >= nowIso).length;

    return {
      id: p.id,
      name: p.name,
      email: p.email,
      phone: p.phone,
      role: p.role,
      color: p.color,
      active: p.active,
      booking_count: activeBookings.length,
      paid_total: paidTotal,
      upcoming_count: upcomingCount,
    };
  });

  return NextResponse.json({ team: mapped });
}

function values(body: Record<string, unknown>) {
  const name = String(body.name ?? '').trim();
  const email = String(body.email ?? '').trim().toLowerCase();
  const phone = String(body.phone ?? '').trim();
  const role = String(body.role ?? '').trim();
  const color = String(body.color ?? '#6366f1');
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || !role || !/^#[0-9a-f]{6}$/i.test(color)) return null;
  return { name, email, phone, role, color };
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Debes iniciar sesión.' }, { status: 401 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 500 });

  const b = await businessFor(supabase, user.userId, true);
  if (!b) return NextResponse.json({ error: 'No se pudo preparar el negocio.' }, { status: 500 });

  const body = (await request.json()) as Record<string, unknown>;
  const data = values(body);
  if (!data) return NextResponse.json({ error: 'Revisa nombre, correo, cargo y color.' }, { status: 400 });

  const { data: duplicate } = await supabase
    .from('professionals')
    .select('id')
    .eq('business_id', b.id)
    .or(`name.ilike.${data.name},email.ilike.${data.email}`)
    .maybeSingle();

  if (duplicate) return NextResponse.json({ error: 'Ya existe un integrante con ese nombre o correo.' }, { status: 409 });

  const active = body.active !== false;

  const { data: created, error } = await supabase
    .from('professionals')
    .insert({
      business_id: b.id,
      name: data.name,
      email: data.email,
      phone: data.phone || null,
      role: data.role,
      color: data.color,
      active,
    })
    .select('id')
    .single();

  if (error || !created) return NextResponse.json({ error: error?.message || 'Error al agregar instructor.' }, { status: 500 });

  return NextResponse.json(
    { id: created.id, message: 'Instructor agregado correctamente al equipo.' },
    { status: 201 }
  );
}

export async function PATCH(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Debes iniciar sesión.' }, { status: 401 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 500 });

  const b = await businessFor(supabase, user.userId);
  if (!b) return NextResponse.json({ error: 'Negocio no encontrado.' }, { status: 404 });

  const body = (await request.json()) as Record<string, unknown>;
  const id = Number(body.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Integrante inválido.' }, { status: 400 });

  if (typeof body.active === 'boolean' && Object.keys(body).length <= 2) {
    const { error } = await supabase
      .from('professionals')
      .update({ active: body.active })
      .eq('id', id)
      .eq('business_id', b.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      message: body.active ? 'Instructor activado (agenda abierta).' : 'Instructor dado de baja (agenda pausada).',
    });
  }

  const data = values(body);
  if (!data) return NextResponse.json({ error: 'Revisa nombre, correo, cargo y color.' }, { status: 400 });

  const { data: duplicate } = await supabase
    .from('professionals')
    .select('id')
    .eq('business_id', b.id)
    .or(`name.ilike.${data.name},email.ilike.${data.email}`)
    .neq('id', id)
    .maybeSingle();

  if (duplicate) return NextResponse.json({ error: 'Otro integrante ya utiliza ese nombre o correo.' }, { status: 409 });

  const activeVal = typeof body.active === 'boolean' ? body.active : undefined;

  const updatePayload: Record<string, unknown> = {
    name: data.name,
    email: data.email,
    phone: data.phone || null,
    role: data.role,
    color: data.color,
  };
  if (activeVal !== undefined) updatePayload.active = activeVal;

  const { error } = await supabase
    .from('professionals')
    .update(updatePayload)
    .eq('id', id)
    .eq('business_id', b.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ message: 'Instructor actualizado correctamente.' });
}

export async function DELETE(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Debes iniciar sesión.' }, { status: 401 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 500 });

  const b = await businessFor(supabase, user.userId);
  if (!b) return NextResponse.json({ error: 'Negocio no encontrado.' }, { status: 404 });

  let id: number | null = null;
  let force = false;
  const { searchParams } = new URL(request.url);
  const queryId = searchParams.get('id');
  if (queryId) {
    id = Number(queryId);
    force = searchParams.get('force') === '1' || searchParams.get('force') === 'true';
  } else {
    try {
      const body = (await request.json()) as Record<string, unknown>;
      id = Number(body.id);
      force = body.force === true || body.force === '1' || body.force === 1;
    } catch {}
  }

  if (!id || !Number.isInteger(id)) {
    return NextResponse.json({ error: 'ID de integrante inválido.' }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from('professionals')
    .select('id, name')
    .eq('id', id)
    .eq('business_id', b.id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: 'Integrante no encontrado.' }, { status: 404 });
  }

  const nowIso = new Date().toISOString();
  const { count } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('professional_id', id)
    .eq('business_id', b.id)
    .gte('starts_at', nowIso)
    .neq('status', 'cancelled');

  if (!force && count && count > 0) {
    return NextResponse.json(
      {
        error: `El instructor "${existing.name}" tiene ${count} clase(s) o reserva(s) programada(s). Puedes darlo de baja para mantener su historial, o confirmar su eliminación definitiva cancelando sus reservas.`,
        hasUpcoming: true,
        upcomingCount: count,
      },
      { status: 409 }
    );
  }

  await supabase.from('bookings').delete().eq('professional_id', id).eq('business_id', b.id);
  const { error } = await supabase.from('professionals').delete().eq('id', id).eq('business_id', b.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ message: `Instructor ${existing.name} eliminado del equipo correctamente.` });
}
