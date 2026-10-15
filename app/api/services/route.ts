import { NextResponse } from 'next/server';
import { getChatGPTUser } from '../../chatgpt-auth';
import { getSupabase } from '../../lib/supabase';
import { getBusinessForUser } from '../../lib/tenant';

async function businessFor(supabase: any, user: any, request?: Request, create = false) {
  const bId = request?.headers?.get('x-business-id');
  return getBusinessForUser(supabase, user, create, bId ? Number(bId) : null);
}

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Debes iniciar sesión.' }, { status: 401 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 500 });

  const b = await businessFor(supabase, user, request, true);
  if (!b) return NextResponse.json({ error: 'No se pudo preparar el negocio.' }, { status: 500 });

  const { data: professionals } = await supabase
    .from('professionals')
    .select('id, name')
    .eq('business_id', b.id);

  const profMap = new Map<number, string>();
  for (const p of (professionals || [])) {
    profMap.set(p.id, p.name);
  }

  const { data: services, error } = await supabase
    .from('services')
    .select(`
      id, name, description, mode, class_type, capacity, billing_period,
      duration_minutes, price_clp, deposit_percent, active, schedule,
      bookings(id, payment_status, amount_clp, status, professional_id)
    `)
    .eq('business_id', b.id)
    .order('active', { ascending: false })
    .order('name', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const mapped = (services || []).map((s: any) => {
    const activeBookings = (s.bookings || []).filter((bk: any) => bk.status !== 'cancelled');
    const paidTotal = activeBookings
      .filter((bk: any) => bk.payment_status === 'paid')
      .reduce((sum: number, bk: any) => sum + (bk.amount_clp || 0), 0);

    const descStr = s.description || '';
    const match = descStr.match(/<!--instructor:(\d+)-->/);
    let instructorId: number | null = match ? Number(match[1]) : null;
    if (!instructorId && activeBookings.length > 0) {
      const lastBooking = activeBookings[activeBookings.length - 1];
      if (lastBooking?.professional_id) instructorId = Number(lastBooking.professional_id);
    }
    const instructorName = instructorId ? (profMap.get(instructorId) || null) : null;
    
    const showInstructor = !descStr.includes('<!--show_instructor:false-->');
    const showSchedule = !descStr.includes('<!--show_schedule:false-->');
    const scheduleMode = descStr.includes('<!--schedule_mode:flexible-->') ? 'flexible' : (s.schedule && s.schedule !== 'null' ? 'fixed' : 'flexible');

    const cleanDescription = descStr.replace(/<!--[\s\S]*?-->/g, '').trim() || null;
    const cleanSchedule = (s.schedule && s.schedule !== 'null' && s.schedule !== 'undefined' && s.schedule.trim() !== '') ? s.schedule.trim() : null;

    return {
      id: s.id,
      name: s.name,
      description: cleanDescription,
      mode: s.mode,
      class_type: s.class_type,
      capacity: s.capacity,
      billing_period: s.billing_period,
      duration_minutes: s.duration_minutes,
      price_clp: s.price_clp,
      deposit_percent: s.deposit_percent,
      active: s.active,
      schedule: cleanSchedule,
      instructor_id: instructorId,
      instructor_name: instructorName,
      show_instructor: showInstructor,
      show_schedule: showSchedule,
      schedule_mode: scheduleMode,
      booking_count: activeBookings.length,
      paid_total: paidTotal,
    };
  });

  return NextResponse.json({ services: mapped });
}

function values(body: Record<string, unknown>) {
  const name = String(body.name ?? '').trim();
  const rawDesc = String(body.description ?? '').trim();
  const professionalId = body.professionalId ? Number(body.professionalId) : (body.instructor_id ? Number(body.instructor_id) : null);
  
  const showInstructor = body.showInstructor !== undefined ? Boolean(body.showInstructor) : (body.show_instructor !== undefined ? Boolean(body.show_instructor) : true);
  const showSchedule = body.showSchedule !== undefined ? Boolean(body.showSchedule) : (body.show_schedule !== undefined ? Boolean(body.show_schedule) : true);
  const scheduleMode = String(body.scheduleMode ?? body.schedule_mode ?? 'fixed') === 'flexible' ? 'flexible' : 'fixed';

  const userDesc = rawDesc.replace(/<!--[\s\S]*?-->/g, '').trim();

  const tags: string[] = [];
  if (professionalId) tags.push(`<!--instructor:${professionalId}-->`);
  if (!showInstructor) tags.push('<!--show_instructor:false-->');
  if (!showSchedule || scheduleMode === 'flexible') tags.push('<!--show_schedule:false-->');
  if (scheduleMode === 'flexible') tags.push('<!--schedule_mode:flexible-->');

  const description = tags.length > 0 ? `${tags.join('')}${userDesc}` : (userDesc || null);

  const mode = String(body.mode ?? 'presencial');
  const classType = String(body.classType ?? body.class_type ?? 'individual');
  const rawCapacity = Number(body.capacity ?? (classType === 'grupal' ? 10 : 1));
  const capacity = classType === 'grupal' ? Math.max(1, rawCapacity) : 1;
  const duration = Number(body.durationMinutes ?? body.duration_minutes);
  const price = Number(body.priceClp ?? body.price_clp);
  const deposit = Number(body.depositPercent ?? body.deposit_percent ?? 0);
  const rawPeriod = String(body.billingPeriod ?? body.billing_period ?? 'mensual').toLowerCase();
  const billingPeriod = ['mensual', 'anual', 'sesion'].includes(rawPeriod) ? rawPeriod : 'mensual';

  const rawSched = body.schedule !== undefined ? String(body.schedule).trim() : null;
  const schedule = (rawSched && rawSched !== 'null' && rawSched !== 'undefined' && scheduleMode !== 'flexible') ? rawSched : null;

  if (
    !name ||
    !['presencial', 'online', 'hibrido'].includes(mode) ||
    !['individual', 'grupal'].includes(classType) ||
    !Number.isInteger(duration) ||
    duration < 15 ||
    duration > 480 ||
    !Number.isFinite(price) ||
    price < 0 ||
    !Number.isFinite(deposit) ||
    deposit < 0 ||
    deposit > 100
  ) {
    return null;
  }
  return { name, description, mode, classType, capacity, duration, price, deposit, billingPeriod, schedule };
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Debes iniciar sesión.' }, { status: 401 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 500 });

  const b = await businessFor(supabase, user, request, true);
  if (!b) return NextResponse.json({ error: 'No se pudo preparar el negocio.' }, { status: 500 });

  const data = values((await request.json()) as Record<string, unknown>);
  if (!data) return NextResponse.json({ error: 'Revisa el nombre, tipo de clase, capacidad, duración y precio.' }, { status: 400 });

  const { data: duplicate } = await supabase
    .from('services')
    .select('id')
    .eq('business_id', b.id)
    .ilike('name', data.name)
    .maybeSingle();

  if (duplicate) return NextResponse.json({ error: 'Ya existe una clase con ese nombre.' }, { status: 409 });

  const { data: created, error } = await supabase
    .from('services')
    .insert({
      business_id: b.id,
      name: data.name,
      description: data.description || null,
      mode: data.mode,
      class_type: data.classType,
      capacity: data.capacity,
      duration_minutes: data.duration,
      price_clp: data.price,
      deposit_percent: data.deposit,
      billing_period: data.billingPeriod,
      schedule: data.schedule || null,
      active: true,
    })
    .select('id')
    .single();

  if (error || !created) {
    return NextResponse.json({ error: error?.message || 'Error al crear clase.' }, { status: 500 });
  }

  return NextResponse.json({ id: created.id, message: 'Clase creada correctamente.' }, { status: 201 });
}

export async function PATCH(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Debes iniciar sesión.' }, { status: 401 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 500 });

  const b = await businessFor(supabase, user, request);
  if (!b) return NextResponse.json({ error: 'Clase no encontrada.' }, { status: 404 });

  const body = (await request.json()) as Record<string, unknown>;
  const id = Number(body.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Clase inválida.' }, { status: 400 });

  if (typeof body.active === 'boolean') {
    const { error } = await supabase
      .from('services')
      .update({ active: body.active })
      .eq('id', id)
      .eq('business_id', b.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ message: body.active ? 'Clase activada.' : 'Clase pausada.' });
  }

  const data = values(body);
  if (!data) return NextResponse.json({ error: 'Revisa el nombre, tipo de clase, capacidad, duración y precio.' }, { status: 400 });

  const { data: duplicate } = await supabase
    .from('services')
    .select('id')
    .eq('business_id', b.id)
    .ilike('name', data.name)
    .neq('id', id)
    .maybeSingle();

  if (duplicate) return NextResponse.json({ error: 'Ya existe otra clase con ese nombre.' }, { status: 409 });

  const { error } = await supabase
    .from('services')
    .update({
      name: data.name,
      description: data.description || null,
      mode: data.mode,
      class_type: data.classType,
      capacity: data.capacity,
      duration_minutes: data.duration,
      price_clp: data.price,
      deposit_percent: data.deposit,
      billing_period: data.billingPeriod,
      schedule: data.schedule || null,
    })
    .eq('id', id)
    .eq('business_id', b.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ message: 'Clase actualizada correctamente.' });
}

export async function DELETE(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Debes iniciar sesión.' }, { status: 401 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 500 });

  const b = await businessFor(supabase, user, request);
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
    return NextResponse.json({ error: 'ID de clase inválido.' }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from('services')
    .select('id, name')
    .eq('id', id)
    .eq('business_id', b.id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: 'Clase no encontrada.' }, { status: 404 });
  }

  const nowIso = new Date().toISOString();
  const { count } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('service_id', id)
    .eq('business_id', b.id)
    .gte('starts_at', nowIso)
    .neq('status', 'cancelled');

  if (!force && count && count > 0) {
    return NextResponse.json(
      {
        error: `La clase "${existing.name}" tiene ${count} reserva(s) futura(s) agendada(s). Puedes pausarla para no recibir nuevas inscripciones, o confirmar su eliminación definitiva.`,
        hasUpcoming: true,
        upcomingCount: count,
      },
      { status: 409 }
    );
  }

  // Delete all bookings for this service
  await supabase.from('bookings').delete().eq('service_id', id).eq('business_id', b.id);

  // Delete service
  const { error } = await supabase.from('services').delete().eq('id', id).eq('business_id', b.id);
  if (error) {
    return NextResponse.json({ error: 'No se pudo eliminar la clase.' }, { status: 500 });
  }

  return NextResponse.json({ message: `Clase "${existing.name}" eliminada correctamente.` });
}
